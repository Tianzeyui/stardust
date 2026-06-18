//! OpenAI 兼容 API 流式客户端 (DeepSeek/Qwen/OpenRouter/Groq/Mistral/...)
//! 对齐 src/lib/api/openai-compat.ts

use super::{ChatMessage, ProviderConfig, StreamEvent, ToolDef, Usage};
use serde_json::Value;

pub async fn stream_openai_compat(
    config: &ProviderConfig,
    messages: &[ChatMessage],
    tools: &[ToolDef],
    system_prompt: Option<&str>,
    max_tokens: Option<u32>,
    tx: tokio::sync::mpsc::Sender<StreamEvent>,
) -> Result<Usage, String> {
    let base_url = config.base_url.as_deref().unwrap_or("https://api.deepseek.com");
    let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));

    let mut openai_msgs: Vec<Value> = Vec::new();

    if let Some(sys) = system_prompt {
        openai_msgs.push(serde_json::json!({"role": "system", "content": sys}));
    }

    for m in messages {
        if m.role == "system" { continue; }
        let mut obj = serde_json::json!({"role": m.role, "content": m.content});
        if let Some(ref rc) = m.reasoning_content { obj["reasoning_content"] = serde_json::json!(rc); }

        if let Some(ref tc) = m.tool_calls {
            obj["tool_calls"] = serde_json::json!(tc.iter().map(|c| {
                serde_json::json!({
                    "id": c.id,
                    "type": "function",
                    "function": { "name": c.name, "arguments": serde_json::to_string(&c.input).unwrap_or_default() },
                })
            }).collect::<Vec<_>>());
        }
        // role=tool 必须有 tool_call_id（OpenAI/DeepSeek 强制要求）
        if m.role == "tool" || m.tool_call_id.is_some() {
            obj["role"] = serde_json::Value::String("tool".into());
            obj["tool_call_id"] = serde_json::json!(m.tool_call_id.as_deref().unwrap_or("unknown"));
        }

        openai_msgs.push(obj);
    }

    let openai_tools: Vec<Value> = tools.iter().map(|t| {
        serde_json::json!({
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.input_schema,
            },
        })
    }).collect();

    let mut body = serde_json::json!({
        "model": config.model_id,
        "messages": openai_msgs,
        "max_tokens": max_tokens.unwrap_or(4096),
        "stream": true,
    });
    if !openai_tools.is_empty() {
        body["tools"] = serde_json::json!(openai_tools);
    }

    let client = reqwest::Client::new();
    let response = client.post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API 请求失败: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!("API HTTP {}: {}", status.as_u16(), &err_body[..300.min(err_body.len())]));
    }

    let mut stream = response.bytes_stream();
    use futures::StreamExt;
    let mut buffer = String::new();
    let mut input_tokens = 0u32;
    let mut output_tokens = 0u32;
    let mut finish_reason = "stop".to_string();

    // 累积 tool call 参数
    let mut pending_calls: Vec<(String, String, String)> = Vec::new(); // (index, id, name, arguments_json)
    let mut pending_index = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("SSE 读取错误: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find("\n\n") {
            let event_str = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();

            for line in event_str.lines() {
                let line = line.trim();
                if line.is_empty() || !line.starts_with("data: ") { continue; }
                let data = &line[6..];
                if data == "[DONE]" { continue; }

                let event: Value = match serde_json::from_str(data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                if let Some(choices) = event["choices"].as_array() {
                    for choice in choices {
                        // Reasoning delta（DeepSeek R1 思维链）
                        if let Some(rc) = choice["delta"]["reasoning_content"].as_str() {
                            if !rc.is_empty() {
                                let _ = tx.send(StreamEvent::ReasoningDelta { text: rc.to_string() }).await;
                            }
                        }
                        // Text delta
                        if let Some(text) = choice["delta"]["content"].as_str() {
                            if !text.is_empty() {
                                let _ = tx.send(StreamEvent::TextDelta { text: text.to_string() }).await;
                            }
                        }

                        // Tool calls delta
                        if let Some(tc_list) = choice["delta"]["tool_calls"].as_array() {
                            for tc in tc_list {
                                let idx = tc["index"].as_u64().map(|i| i.to_string()).unwrap_or_default();
                                let id = tc["id"].as_str().unwrap_or("").to_string();
                                let func_name = tc["function"]["name"].as_str().unwrap_or("").to_string();
                                let args = tc["function"]["arguments"].as_str().unwrap_or("").to_string();

                                if !id.is_empty() || !idx.is_empty() {
                                    // 新 tool call 或已有 call 的参数
                                    let key = if !id.is_empty() { id.clone() } else { idx.clone() };
                                    let existing = pending_calls.iter_mut().find(|(k, _, _)| *k == key);
                                    if let Some((_, _, ref mut accumulated)) = existing {
                                        accumulated.push_str(&args);
                                    } else if !func_name.is_empty() || !args.is_empty() {
                                        pending_calls.push((key, func_name, args));
                                    }
                                }
                            }
                        }

                        // Finish reason
                        if let Some(fr) = choice["finish_reason"].as_str() {
                            if !fr.is_empty() && fr != "null" {
                                finish_reason = fr.to_string();

                                // 发送累积的 tool calls
                                for (cid, cname, c_args) in pending_calls.drain(..) {
                                    let input: Value = if c_args.is_empty() {
                                        serde_json::json!({})
                                    } else {
                                        serde_json::from_str(&c_args).unwrap_or(serde_json::json!({"raw": c_args}))
                                    };
                                    let _ = tx.send(StreamEvent::ToolCallStart {
                                        id: cid,
                                        name: cname,
                                        input,
                                    }).await;
                                }
                            }
                        }
                    }
                }

                if let Some(usage) = event.get("usage") {
                    input_tokens = usage["prompt_tokens"].as_u64().unwrap_or(0) as u32;
                    output_tokens = usage["completion_tokens"].as_u64().unwrap_or(0) as u32;
                }

                // x_groq usage
                if let Some(usage) = event.get("x_groq").and_then(|g| g.get("usage")) {
                    input_tokens = usage["prompt_tokens"].as_u64().unwrap_or(0) as u32;
                    output_tokens = usage["completion_tokens"].as_u64().unwrap_or(0) as u32;
                }
            }
        }
    }

    let _ = tx.send(StreamEvent::Done {
        finish_reason: finish_reason.clone(),
        input_tokens,
        output_tokens,
    }).await;

    Ok(Usage { input_tokens, output_tokens })
}
