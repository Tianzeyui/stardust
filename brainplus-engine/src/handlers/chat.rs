//! 上下文管理 handler — 压缩 & token 估算
//! AI 引擎由 TS 侧负责，Rust 仅执行工具

use crate::api::ChatMessage;
use crate::handlers::{Registry};
use crate::protocol::HandlerResult;
use serde_json::json;
use tokio::sync::mpsc;

// ====== 上下文压缩 ======

fn estimate_tokens(text: &str) -> usize { text.len() / 4 }

async fn chat_compress(req: crate::protocol::Request, _tx: mpsc::Sender<crate::handlers::OutputLine>) -> HandlerResult {
    let messages: Vec<ChatMessage> = req.params.get("messages")
        .and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
    let context_window: usize = req.params.get("contextWindow")
        .and_then(|v| v.as_u64()).unwrap_or(100000) as usize;
    let extra_tokens: usize = req.params.get("extraTokens")
        .and_then(|v| v.as_u64()).unwrap_or(0) as usize;

    let total: usize = messages.iter().map(|m| estimate_tokens(&m.content)).sum();

    if total + extra_tokens < context_window - 2000 {
        return Ok(json!({ "wasCompressed": false, "messages": messages, "originalTokens": total, "compressedTokens": total }));
    }

    // 保留最后 4 条消息，前面的压缩为摘要
    let split = if messages.len() > 4 { messages.len() - 4 } else { 0 };
    let early = &messages[..split];
    let recent = &messages[split..];

    let summary_parts: Vec<String> = early.iter()
        .map(|m| format!("[{role}]: {text:.200}", role = m.role, text = m.content.chars().take(200).collect::<String>()))
        .collect();

    let summary = format!(
        "<summary>\n早期对话摘要 ({} 条消息已压缩, {} tokens):\n{}\n</summary>",
        early.len(), total, summary_parts.join("\n")
    );

    let mut compressed: Vec<ChatMessage> = vec![ChatMessage {
        role: "user".into(),
        content: summary,
        tool_calls: None,
        tool_call_id: None, reasoning_content: None,
    }];
    compressed.extend_from_slice(recent);

    let new_tokens: usize = compressed.iter().map(|m| estimate_tokens(&m.content)).sum();
    Ok(json!({
        "wasCompressed": true,
        "messages": compressed,
        "originalTokens": total,
        "compressedTokens": new_tokens,
        "summary": format!("对话已压缩：{} → {} tokens", total, new_tokens),
    }))
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("chat.compress", |req, tx| Box::pin(chat_compress(req, tx)));
    registry.register("chat.estimateTokens", |_req, _tx| {
        Box::pin(async move {
            Ok(json!({"tokensPerChar": 0.25}))
        })
    });
}
