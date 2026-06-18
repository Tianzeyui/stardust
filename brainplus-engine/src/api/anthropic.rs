//! Anthropic Messages API 流式客户端
//! 对齐 src/lib/api/anthropic.ts

use super::{ChatMessage, ProviderConfig, StreamEvent, ToolDef};
use futures::StreamExt;
use serde_json::Value;

pub async fn stream_anthropic(
    config: &ProviderConfig,
    messages: &[ChatMessage],
    tools: &[ToolDef],
    system_prompt: Option<&str>,
    max_tokens: Option<u32>,
    mut tx: tokio::sync::mpsc::Sender<StreamEvent>,
) -> Result<Usage, String> {
    let base_url = config.base_url.as_deref().unwrap_or("https://api.anthropic.com");
    let url = format!("{}/v1/messages", base_url.trim_end_matches('/'));

    // 构建 anthropic 格式的 tool 定义
    let anthropic_tools: Vec<Value> = tools.iter().map(|t| {
        serde_json::json!({
            "name": t.name,
            "description": t.description,
            "input_schema": t.input_schema,
        })
    }).collect();

    // 分离 system 消息
    let system = system_prompt.unwrap_or("You are a coding assistant.").to_string();

    // 构建 messages（Anthropic 格式不需要 system role）
    let anthropic_msgs: Vec<Value> = messages.iter().map(|m| {
        let mut obj = serde_json::json!({"role": m.role, "content": m.content});
        if let Some(ref tc) = m.tool_calls {
            let tool_blocks: Vec<Value> = tc.iter().map(|c| {
                serde_json::json!({
                    "type": "tool_use",
                    "id": c.id,
                    "name": c.name,
                    "input": c.input,
                })
            }).collect();
            obj["content"] = serde_json::json!(tool_blocks);
        }
        if let Some(ref tci) = m.tool_call_id {
            obj["content"] = serde_json::json!([{
                "type": "tool_result",
                "tool_use_id": tci,
                "content": m.content,
            }]);
            obj["role"] = serde_json::Value::String("user".into());
        }
        obj
    }).collect();

    let mut body = serde_json::json!({
        "model": config.model_id,
        "messages": anthropic_msgs,
        "system": system,
        "max_tokens": max_tokens.unwrap_or(4096),
        "stream": true,
    });
    if !anthropic_tools.is_empty() {
        body["tools"] = serde_json::json!(anthropic_tools);
    }

    let client = reqwest::Client::new();
    let response = client.post(&url)
        .header("x-api-key", &config.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic API 请求失败: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic HTTP {}: {}", status.as_u16(), &err_body[..300.min(err_body.len())]));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut input_tokens = 0u32;
    let mut output_tokens = 0u32;
    let mut finish_reason = "stop".to_string();
    let mut pending_tool_call: Option<(String, String)> = None; // (id, name)
    let mut pending_input = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("SSE 读取错误: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find("\n\n") {
            let event_str = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();

            for line in event_str.lines() {
                let line = line.trim();
                if line.is_empty() || !line.starts_with("data: ") {
                    continue;
                }

                let data = &line[6..];
                if data == "[DONE]" { continue; }

                let event: Value = match serde_json::from_str(data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                match event["type"].as_str() {
                    Some("message_start") => {
                        if let Some(usage) = event["message"].get("usage") {
                            input_tokens = usage["input_tokens"].as_u64().unwrap_or(0) as u32;
                        }
                    }

                    Some("content_block_start") => {
                        let block = &event["content_block"];
                        if block["type"].as_str() == Some("tool_use") {
                            let id = block["id"].as_str().unwrap_or("").to_string();
                            let name = block["name"].as_str().unwrap_or("").to_string();
                            pending_tool_call = Some((id, name));
                            pending_input.clear();
                        }
                    }

                    Some("content_block_delta") => {
                        let delta = &event["delta"];
                        match delta["type"].as_str() {
                            Some("text_delta") => {
                                let text = delta["text"].as_str().unwrap_or("");
                                let _ = tx.send(StreamEvent::TextDelta { text: text.to_string() }).await;
                            }
                            Some("thinking_delta") => {
                                let text = delta["thinking"].as_str().unwrap_or("");
                                let _ = tx.send(StreamEvent::ReasoningDelta { text: text.to_string() }).await;
                            }
                            Some("input_json_delta") => {
                                pending_input.push_str(delta["partial_json"].as_str().unwrap_or(""));
                            }
                            _ => {}
                        }
                    }

                    Some("content_block_stop") => {
                        if let Some((id, name)) = pending_tool_call.take() {
                            // 尝试解析累积的 JSON 输入
                            let input: Value = if pending_input.is_empty() {
                                serde_json::json!({})
                            } else {
                                serde_json::from_str(&pending_input).unwrap_or(serde_json::json!({}))
                            };
                            let _ = tx.send(StreamEvent::ToolCallStart { id, name, input }).await;
                        }
                    }

                    Some("message_delta") => {
                        if let Some(delta) = event.get("delta") {
                            finish_reason = delta["stop_reason"].as_str().unwrap_or("stop").to_string();
                        }
                        if let Some(usage) = event.get("usage") {
                            output_tokens = usage["output_tokens"].as_u64().unwrap_or(0) as u32;
                        }
                    }

                    Some("message_stop") => {
                        // Final event
                    }

                    _ => {}
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

// re-export types via super
use super::Usage;
