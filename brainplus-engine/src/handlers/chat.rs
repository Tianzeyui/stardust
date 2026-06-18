//! AI Chat handler——工具执行循环（对齐 streamChatWithTools）
//!
//! 接收对话消息 → 调 AI API → 执行工具 → 循环
//! 所有事件通过 mpsc channel 流式推送到 Electron

use crate::api::{detect_provider, ChatMessage, ProviderConfig, StreamEvent, ToolDef, Usage};
use crate::api::{anthropic, openai_compat};
use crate::handlers::{emit, OutputLine, Registry};
use crate::protocol::HandlerResult;
use crate::tools::ToolRegistry;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::mpsc;

/// 构建完整的工具注册表（所有已实现的 Rust 工具）
fn build_tool_registry() -> ToolRegistry {
    let mut registry = ToolRegistry::new();

    // —— 文件操作 ——
    // fs_read_file, fs_write_file 等工具已通过 handlers/fs.rs 实现
    // 这里注册为 AI 可调用的工具

    registry.register(
        "workspace_read_file", "读取文件内容",
        serde_json::json!({"type":"object","properties":{"path":{"type":"string","description":"文件路径"}},"required":["path"]}),
        |input: Value| {
            Box::pin(async move {
                let path = input["path"].as_str().unwrap_or("");
                match tokio::fs::read_to_string(path).await {
                    Ok(s) => Ok(s),
                    Err(e) => Ok(format!("Error: {e}")),
                }
            })
        },
    );

    registry.register(
        "workspace_edit_file", "编辑文件（全文替换）",
        serde_json::json!({"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}),
        |input: Value| {
            Box::pin(async move {
                let path = input["path"].as_str().unwrap_or("");
                let content = input["content"].as_str().unwrap_or("");
                match tokio::fs::write(path, content).await {
                    Ok(()) => Ok("文件已写入".to_string()),
                    Err(e) => Ok(format!("Error: {e}")),
                }
            })
        },
    );

    registry.register(
        "run_terminal", "执行终端命令",
        serde_json::json!({"type":"object","properties":{"command":{"type":"string"},"cwd":{"type":"string"}},"required":["command"]}),
        |input: Value| {
            Box::pin(async move {
                let command = input["command"].as_str().unwrap_or("");
                let cwd = input["cwd"].as_str().unwrap_or(".");
                let result = tokio::process::Command::new("/bin/sh")
                    .args(["-c", command])
                    .current_dir(cwd)
                    .output()
                    .await;
                match result {
                    Ok(o) => {
                        let out = String::from_utf8_lossy(&o.stdout);
                        let err = String::from_utf8_lossy(&o.stderr);
                        Ok(format!("{out}{err}"))
                    }
                    Err(e) => Ok(format!("Error: {e}")),
                }
            })
        },
    );

    registry.register(
        "web_search", "搜索网页",
        serde_json::json!({"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}),
        |_input: Value| {
            Box::pin(async move {
                Ok("网页搜索功能需要配置 API key".to_string())
            })
        },
    );

    registry
}

// ====== chat.send handler ======

async fn chat_send(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    // 解析 config
    let provider = req.params.get("provider").and_then(|v| v.as_str()).unwrap_or("anthropic").to_string();
    let model_id = req.params.get("modelId").and_then(|v| v.as_str()).unwrap_or("claude-sonnet-4-6").to_string();
    let api_key = req.params.get("apiKey").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let base_url = req.params.get("baseUrl").and_then(|v| v.as_str()).map(String::from);

    let config = ProviderConfig { provider, model_id, api_key, base_url };

    // 解析 messages
    let messages: Vec<ChatMessage> = req.params.get("messages")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let system_prompt = req.params.get("systemPrompt").and_then(|v| v.as_str()).map(String::from);
    let max_steps = req.params.get("maxSteps").and_then(|v| v.as_u64()).unwrap_or(25) as usize;

    // 构建工具注册表
    let tools = build_tool_registry();
    let tool_defs = tools.definitions();

    // 流式事件通道
    let (stream_tx, mut stream_rx) = mpsc::channel::<StreamEvent>(128);

    let config_clone = config.clone();
    let msgs_clone = messages.clone();

    // 后台任务：执行 AI 对话 + 工具循环
    let loop_tx = tx.clone();
    tokio::spawn(async move {
        let result = run_tool_loop(&config_clone, msgs_clone, &tool_defs, &tools, system_prompt.as_deref(), max_steps, &loop_tx, stream_tx).await;

        match result {
            Ok(usage) => {
                emit(&loop_tx, "chat.done", serde_json::json!({
                    "inputTokens": usage.input_tokens,
                    "outputTokens": usage.output_tokens,
                }));
            }
            Err(e) => {
                emit(&loop_tx, "chat.error", serde_json::json!({"error": e}));
            }
        }
    });

    // 转发流式事件到 Electron
    while let Some(event) = stream_rx.recv().await {
        match event {
            StreamEvent::TextDelta { text } => {
                emit(&tx, "chat.textDelta", serde_json::json!({"text": text}));
            }
            StreamEvent::ReasoningDelta { text } => {
                emit(&tx, "chat.reasoningDelta", serde_json::json!({"text": text}));
            }
            StreamEvent::ToolCallStart { id, name, input } => {
                emit(&tx, "chat.toolCall", serde_json::json!({
                    "toolName": name, "toolInput": input, "toolCallId": id,
                }));
            }
            StreamEvent::ToolResult { tool_name, tool_output } => {
                emit(&tx, "chat.toolResult", serde_json::json!({
                    "toolName": tool_name, "toolOutput": tool_output,
                }));
            }
            StreamEvent::Done { .. } => {}
        }
    }

    Ok(serde_json::json!({"success": true}))
}

// ====== 工具执行循环 ======

async fn run_tool_loop(
    config: &ProviderConfig,
    mut messages: Vec<ChatMessage>,
    tool_defs: &[ToolDef],
    tools: &ToolRegistry,
    system_prompt: Option<&str>,
    max_steps: usize,
    emit_tx: &mpsc::Sender<OutputLine>,
    stream_tx: mpsc::Sender<StreamEvent>,
) -> Result<Usage, String> {
    let mut steps = 0;

    loop {
        if steps >= max_steps {
            let _ = stream_tx.send(StreamEvent::Done {
                finish_reason: "max_steps".into(),
                input_tokens: 0, output_tokens: 0,
            }).await;
            return Ok(Usage { input_tokens: 0, output_tokens: 0 });
        }

        let (event_tx, mut event_rx) = mpsc::channel::<StreamEvent>(64);

        let provider_type = detect_provider(config);
        let api_result = if provider_type == "anthropic" {
            anthropic::stream_anthropic(config, &messages, tool_defs, system_prompt, None, event_tx).await
        } else {
            openai_compat::stream_openai_compat(config, &messages, tool_defs, system_prompt, None, event_tx).await
        };

        let mut usage = match api_result {
            Ok(u) => u,
            Err(e) => return Err(e),
        };

        // 收集本轮事件
        let mut had_tool_calls = false;
        let mut assistant_content = String::new();
        let mut pending_calls: Vec<(String, String, Value)> = Vec::new(); // (id, name, input)

        while let Some(event) = event_rx.recv().await {
            match event {
                StreamEvent::TextDelta { text } => {
                    assistant_content.push_str(&text);
                    let _ = stream_tx.send(StreamEvent::TextDelta { text }).await;
                }
                StreamEvent::ReasoningDelta { text } => {
                    let _ = stream_tx.send(StreamEvent::ReasoningDelta { text }).await;
                }
                StreamEvent::ToolCallStart { id, name, input } => {
                    had_tool_calls = true;
                    let _ = stream_tx.send(StreamEvent::ToolCallStart { id: id.clone(), name: name.clone(), input: input.clone() }).await;
                    pending_calls.push((id, name, input));
                }
                StreamEvent::Done { .. } => {}
                StreamEvent::ToolResult { .. } => {}
            }
        }

        // 无工具调用 → 结束
        if !had_tool_calls {
            let _ = stream_tx.send(StreamEvent::Done {
                finish_reason: "stop".into(),
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
            }).await;
            return Ok(usage);
        }

        // 添加 assistant 消息
        messages.push(ChatMessage {
            role: "assistant".into(),
            content: if assistant_content.is_empty() { "(tool calls)".into() } else { assistant_content.clone() },
            tool_calls: Some(pending_calls.iter().map(|(id, name, input)| {
                crate::api::ToolCall {
                    id: id.clone(),
                    call_type: "function".into(),
                    name: name.clone(),
                    input: input.clone(),
                }
            }).collect()),
            tool_call_id: None,
        });

        // 执行工具
        for (id, name, input) in &pending_calls {
            let result = tools.execute(name, input.clone()).await;
            let output = match result {
                Ok(s) => s,
                Err(e) => format!("Error: {e}"),
            };

            let _ = stream_tx.send(StreamEvent::ToolResult {
                tool_name: name.clone(),
                tool_output: output.clone(),
            }).await;

            // 添加 tool result 消息
            messages.push(ChatMessage {
                role: "tool".into(),
                content: output,
                tool_calls: None,
                tool_call_id: Some(id.clone()),
            });
        }

        steps += 1;
    }
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("chat.send", |req, tx| Box::pin(chat_send(req, tx)));
}
