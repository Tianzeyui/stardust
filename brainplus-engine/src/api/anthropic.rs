//! Anthropic Messages API 流式客户端

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

    let anthropic_tools: Vec<Value> = tools.iter().map(|t| {
        serde_json::json!({"name": t.name, "description": t.description, "input_schema": t.input_schema})
    }).collect();

    let system = system_prompt.unwrap_or("You are a coding assistant.").to_string();

    // 构建 Anthropic 消息（role=tool → user + tool_result）
    let anthropic_msgs: Vec<Value> = messages.iter().filter(|m| m.role != "system").map(|m| {
        let mut obj = serde_json::json!({"role": m.role, "content": m.content});
        // assistant 带 tool_calls
        if let Some(ref tc) = m.tool_calls {
            let blocks: Vec<Value> = tc.iter().map(|c| serde_json::json!({
                "type": "tool_use", "id": c.id, "name": c.name, "input": c.input,
            })).collect();
            obj["content"] = serde_json::json!(blocks);
        }
        // tool role → user + tool_result（Anthropic 不支持 role=tool）
        if m.role == "tool" {
            obj["content"] = serde_json::json!([{
                "type": "tool_result",
                "tool_use_id": m.tool_call_id.as_deref().unwrap_or("unknown"),
                "content": m.content,
            }]);
            obj["role"] = serde_json::Value::String("user".into());
        }
        obj
    }).collect();

    let mut body = serde_json::json!({
        "model": config.model_id, "messages": anthropic_msgs, "system": system,
        "max_tokens": max_tokens.unwrap_or(4096), "stream": true,
    });
    if !anthropic_tools.is_empty() { body["tools"] = serde_json::json!(anthropic_tools); }

    let client = reqwest::Client::new();
    let response = client.post(&url)
        .header("x-api-key", &config.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body).send().await
        .map_err(|e| format!("Anthropic API 请求失败: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let err_body = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic HTTP {}: {}", status.as_u16(), &err_body[..300.min(err_body.len())]));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut input_tokens = 0u32; let mut output_tokens = 0u32;
    let mut finish_reason = "stop".to_string();
    let mut pending_tool_call: Option<(String, String)> = None;
    let mut pending_input = String::new();

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
                let event: Value = match serde_json::from_str(data) { Ok(v) => v, Err(_) => continue };

                match event["type"].as_str() {
                    Some("message_start") => {
                        if let Some(u) = event["message"].get("usage") { input_tokens = u["input_tokens"].as_u64().unwrap_or(0) as u32; }
                    }
                    Some("content_block_start") => {
                        let block = &event["content_block"];
                        if block["type"].as_str() == Some("tool_use") {
                            pending_tool_call = Some((block["id"].as_str().unwrap_or("").into(), block["name"].as_str().unwrap_or("").into()));
                            pending_input.clear();
                        }
                    }
                    Some("content_block_delta") => {
                        let delta = &event["delta"];
                        match delta["type"].as_str() {
                            Some("text_delta") => { let _ = tx.send(StreamEvent::TextDelta { text: delta["text"].as_str().unwrap_or("").into() }).await; }
                            Some("thinking_delta") => { let _ = tx.send(StreamEvent::ReasoningDelta { text: delta["thinking"].as_str().unwrap_or("").into() }).await; }
                            Some("input_json_delta") => { pending_input.push_str(delta["partial_json"].as_str().unwrap_or("")); }
                            _ => {}
                        }
                    }
                    Some("content_block_stop") => {
                        if let Some((id, name)) = pending_tool_call.take() {
                            let input: Value = if pending_input.is_empty() { serde_json::json!({}) } else { serde_json::from_str(&pending_input).unwrap_or(serde_json::json!({})) };
                            let _ = tx.send(StreamEvent::ToolCallStart { id, name, input }).await;
                        }
                    }
                    Some("message_delta") => {
                        if let Some(d) = event.get("delta") { finish_reason = d["stop_reason"].as_str().unwrap_or("stop").into(); }
                        if let Some(u) = event.get("usage") { output_tokens = u["output_tokens"].as_u64().unwrap_or(0) as u32; }
                    }
                    _ => {}
                }
            }
        }
    }

    let _ = tx.send(StreamEvent::Done { finish_reason: finish_reason.clone(), input_tokens, output_tokens }).await;
    Ok(Usage { input_tokens, output_tokens })
}

use super::Usage;
