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
    registry.register(
        "workspace_read_file", "读取文件内容。参数: path (文件路径)。返回文件全文。",
        serde_json::json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}),
        |input: Value| { let p = input["path"].as_str().unwrap_or("").to_string(); Box::pin(async move { tokio::fs::read_to_string(&p).await.map_err(|e| format!("Error: {e}")) }) },
    );
    registry.register(
        "workspace_edit_file", "写入/替换文件内容。参数: path, content。",
        serde_json::json!({"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}),
        |input: Value| { let p = input["path"].as_str().unwrap_or("").to_string(); let c = input["content"].as_str().unwrap_or("").to_string(); Box::pin(async move { tokio::fs::write(&p, &c).await.map_err(|e| format!("Error: {e}"))?; Ok("文件已写入".into()) }) },
    );
    registry.register(
        "workspace_list_dir", "列出目录内容。参数: path。",
        serde_json::json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}),
        |input: Value| { let p = input["path"].as_str().unwrap_or("").to_string(); Box::pin(async move { let mut dir = tokio::fs::read_dir(&p).await.map_err(|e| format!("Error: {e}"))?; let mut files = vec![]; while let Ok(Some(e)) = dir.next_entry().await { files.push(e.file_name().to_string_lossy().to_string()); } Ok(files.join("\n")) }) },
    );

    // —— 搜索 ——
    registry.register(
        "workspace_find", "递归搜索文件。参数: path (目录)。自动跳过 node_modules/.git。",
        serde_json::json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}),
        |input: Value| { let p = input["path"].as_str().unwrap_or("").to_string(); Box::pin(async move { let mut files = vec![]; for r in ignore::WalkBuilder::new(&p).git_ignore(true).build() { if let Ok(e) = r { if e.file_type().map_or(false,|f|f.is_file()) { files.push(e.path().to_string_lossy().to_string()); if files.len() >= 500 { break; } } } } Ok(files.join("\n")) }) },
    );
    registry.register(
        "workspace_grep", "搜索文件内容（正则）。参数: path, pattern。",
        serde_json::json!({"type":"object","properties":{"path":{"type":"string"},"pattern":{"type":"string"}},"required":["path","pattern"]}),
        |input: Value| { let p = input["path"].as_str().unwrap_or("").to_string(); let pat = input["pattern"].as_str().unwrap_or("").to_string(); Box::pin(async move { let re = regex::RegexBuilder::new(&pat).case_insensitive(true).build().map_err(|e| format!("Regex: {e}"))?; let mut results = vec![]; for r in ignore::WalkBuilder::new(&p).git_ignore(true).build() { if let Ok(e) = r { if e.file_type().map_or(false,|f|f.is_file()) { if let Ok(c) = std::fs::read_to_string(e.path()) { for (i, l) in c.lines().enumerate() { if re.is_match(l) && results.len() < 100 { results.push(format!("{}:{}:{}", e.path().display(), i+1, &l[..l.len().min(200)])); } } } } } } Ok(results.join("\n")) }) },
    );

    // —— 终端 ——
    registry.register(
        "run_terminal", "执行终端命令。参数: command, cwd(可选)。",
        serde_json::json!({"type":"object","properties":{"command":{"type":"string"},"cwd":{"type":"string"}},"required":["command"]}),
        |input: Value| { let cmd = input["command"].as_str().unwrap_or("").to_string(); let cwd = input["cwd"].as_str().unwrap_or(".").to_string(); Box::pin(async move { let o = tokio::process::Command::new("/bin/sh").args(["-c", &cmd]).current_dir(&cwd).output().await.map_err(|e| format!("Error: {e}"))?; Ok(format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr))) }) },
    );

    // —— Git ——
    registry.register(
        "git_status", "查看 git 状态。参数: cwd。",
        serde_json::json!({"type":"object","properties":{"cwd":{"type":"string"}},"required":["cwd"]}),
        |input: Value| { let c = input["cwd"].as_str().unwrap_or(".").to_string(); Box::pin(async move { let o = tokio::process::Command::new("git").args(["status","--porcelain"]).current_dir(&c).output().await.map_err(|e| format!("Error: {e}"))?; Ok(String::from_utf8_lossy(&o.stdout).to_string()) }) },
    );
    registry.register(
        "git_diff", "查看 git diff。参数: cwd。",
        serde_json::json!({"type":"object","properties":{"cwd":{"type":"string"}},"required":["cwd"]}),
        |input: Value| { let c = input["cwd"].as_str().unwrap_or(".").to_string(); Box::pin(async move { let o = tokio::process::Command::new("git").args(["diff"]).current_dir(&c).output().await.map_err(|e| format!("Error: {e}"))?; Ok(String::from_utf8_lossy(&o.stdout).to_string()) }) },
    );

    // —— 沙箱 ——
    registry.register(
        "sandbox_execute_js", "执行 JS 代码。参数: code, packages(可选)。",
        serde_json::json!({"type":"object","properties":{"code":{"type":"string"},"packages":{"type":"array","items":{"type":"string"}}},"required":["code"]}),
        |input: Value| { let code = input["code"].as_str().unwrap_or("").to_string(); let pkgs: Vec<String> = input["packages"].as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default(); Box::pin(async move { if !pkgs.is_empty() { for p in &pkgs { let _ = tokio::process::Command::new("npm").args(["install","--no-save","--no-audit","--ignore-scripts",p]).output().await; } } let o = tokio::process::Command::new("node").args(["-e", &code]).output().await.map_err(|e| format!("Error: {e}"))?; Ok(format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr))) }) },
    );
    registry.register(
        "sandbox_execute_python", "执行 Python 代码。参数: code, packages(可选)。",
        serde_json::json!({"type":"object","properties":{"code":{"type":"string"},"packages":{"type":"array","items":{"type":"string"}}},"required":["code"]}),
        |input: Value| { let code = input["code"].as_str().unwrap_or("").to_string(); let pkgs: Vec<String> = input["packages"].as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default(); Box::pin(async move { let cmd = if tokio::process::Command::new("which").arg("uv").output().await.map(|o|o.status.success()).unwrap_or(false) { "uv".to_string() } else { "python3".to_string() }; let o = if cmd == "uv" && !pkgs.is_empty() { let mut args = vec!["run".into()]; for p in &pkgs { args.push("--with".into()); args.push(p.clone()); } args.push("python".into()); args.push("-c".into()); args.push(code); tokio::process::Command::new("uv").args(&args).output().await } else if cmd == "uv" { tokio::process::Command::new("uv").args(["run","python","-c",&code]).output().await } else { tokio::process::Command::new("python3").args(["-c",&code]).output().await }.map_err(|e| format!("Error: {e}"))?; Ok(format!("{}{}", String::from_utf8_lossy(&o.stdout), String::from_utf8_lossy(&o.stderr))) }) },
    );

    // —— 网络 ——
    registry.register(
        "web_fetch", "抓取网页内容。参数: url。",
        serde_json::json!({"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}),
        |input: Value| { let url = input["url"].as_str().unwrap_or("").to_string(); Box::pin(async move { let c = reqwest::Client::builder().timeout(std::time::Duration::from_secs(15)).build().unwrap_or_default(); let t = c.get(&url).header("User-Agent","Mozilla/5.0").send().await.map_err(|e| format!("Error: {e}"))?.text().await.map_err(|e| format!("Error: {e}"))?; Ok(t.chars().take(10000).collect::<String>()) }) },
    );

    registry
}

// ====== chat.send handler ======

async fn chat_send(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let provider = req.params.get("provider").and_then(|v| v.as_str()).unwrap_or("anthropic").to_string();
    let model_id = req.params.get("modelId").and_then(|v| v.as_str()).unwrap_or("claude-sonnet-4-6").to_string();
    let api_key = req.params.get("apiKey").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let base_url = req.params.get("baseUrl").and_then(|v| v.as_str()).map(String::from);
    let config = ProviderConfig { provider, model_id, api_key, base_url };

    let messages: Vec<ChatMessage> = req.params.get("messages")
        .and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
    let system_prompt = req.params.get("systemPrompt").and_then(|v| v.as_str()).map(String::from);
    let max_steps = req.params.get("maxSteps").and_then(|v| v.as_u64()).unwrap_or(25) as usize;

    let tools = build_tool_registry();
    let tool_defs = tools.definitions();

    // 流式事件通道
    let (stream_tx, mut stream_rx) = mpsc::channel::<StreamEvent>(128);

    // 后台运行工具循环
    let loop_result = {
        let config = config.clone();
        let messages = messages.clone();
        let system = system_prompt.clone();
        let loop_tx = tx.clone();
        tokio::spawn(async move {
            run_tool_loop(&config, messages, &tool_defs, &tools, system.as_deref(), max_steps, &loop_tx, stream_tx).await
        })
    };

    // 转发流式事件到 Electron（在返回之前）
    while let Some(event) = stream_rx.recv().await {
        match event {
            StreamEvent::TextDelta { text } =>
                emit(&tx, "chat.textDelta", serde_json::json!({"text": text})),
            StreamEvent::ReasoningDelta { text } =>
                emit(&tx, "chat.reasoningDelta", serde_json::json!({"text": text})),
            StreamEvent::ToolCallStart { id, name, input } =>
                emit(&tx, "chat.toolCall", serde_json::json!({"toolName": name, "toolInput": input, "toolCallId": id})),
            StreamEvent::ToolResult { tool_name, tool_output } =>
                emit(&tx, "chat.toolResult", serde_json::json!({"toolName": tool_name, "toolOutput": tool_output})),
            StreamEvent::Done { .. } => {}
        }
    }

    // 等待工具循环完成
    match loop_result.await {
        Ok(Ok(usage)) => Ok(serde_json::json!({
            "success": true, "inputTokens": usage.input_tokens, "outputTokens": usage.output_tokens,
        })),
        Ok(Err(e)) => Ok(serde_json::json!({"success": false, "error": e})),
        Err(e) => Ok(serde_json::json!({"success": false, "error": format!("join: {e}")})),
    }
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
        let mut reasoning_content = String::new();
        let mut pending_calls: Vec<(String, String, Value)> = Vec::new();

        while let Some(event) = event_rx.recv().await {
            match event {
                StreamEvent::TextDelta { text } => {
                    assistant_content.push_str(&text);
                    let _ = stream_tx.send(StreamEvent::TextDelta { text }).await;
                }
                StreamEvent::ReasoningDelta { text } => {
                    reasoning_content.push_str(&text);
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
            tool_call_id: None, reasoning_content: None,
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
                reasoning_content: None,
            });
        }

        steps += 1;
    }
}

// ====== 上下文压缩 ======

fn estimate_tokens(text: &str) -> usize { text.len() / 4 }

async fn chat_compress(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let messages: Vec<ChatMessage> = req.params.get("messages")
        .and_then(|v| serde_json::from_value(v.clone()).ok()).unwrap_or_default();
    let context_window: usize = req.params.get("contextWindow").and_then(|v| v.as_u64()).unwrap_or(100000) as usize;
    let system_prompt: Option<String> = req.params.get("systemPrompt").and_then(|v| v.as_str()).map(String::from);

    let overhead = estimate_tokens(&system_prompt.unwrap_or_default()) + 2000; // tool overhead
    let limit = context_window.saturating_sub(overhead);

    let total: usize = messages.iter().map(|m| estimate_tokens(&m.content)).sum();
    if total <= limit {
        return Ok(serde_json::json!({"wasCompressed": false, "messages": messages, "originalTokens": total, "compressedTokens": total}));
    }

    // 保留最后几条消息，其余生成摘要占位
    let keep = 4usize;
    if messages.len() <= keep {
        return Ok(serde_json::json!({"wasCompressed": false, "messages": messages, "originalTokens": total, "compressedTokens": total}));
    }

    let split = messages.len() - keep;
    let early = &messages[..split];
    let recent = &messages[split..];

    // 生成简单摘要
    let mut summary = String::from("<summary>\n对话早期内容摘要（已压缩）:\n");
    for (i, m) in early.iter().enumerate() {
        if m.role == "user" {
            let preview: String = m.content.chars().take(200).collect();
            summary.push_str(&format!("用户: {preview}\n"));
        } else if m.role == "assistant" && !m.content.is_empty() && m.content != "(tool calls)" {
            let preview: String = m.content.chars().take(200).collect();
            summary.push_str(&format!("助手: {preview}\n"));
        }
    }
    summary.push_str("</summary>");

    let mut compressed: Vec<ChatMessage> = vec![ChatMessage {
        role: "user".into(),
        content: summary,
        tool_calls: None,
        tool_call_id: None, reasoning_content: None,
    }];
    compressed.extend_from_slice(recent);

    let new_tokens: usize = compressed.iter().map(|m| estimate_tokens(&m.content)).sum();
    Ok(serde_json::json!({
        "wasCompressed": true,
        "messages": compressed,
        "originalTokens": total,
        "compressedTokens": new_tokens,
        "summary": format!("对话已压缩：{} → {} tokens", total, new_tokens),
    }))
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("chat.send", |req, tx| Box::pin(chat_send(req, tx)));
    registry.register("chat.compress", |req, tx| Box::pin(chat_compress(req, tx)));
    registry.register("chat.estimateTokens", |_req, _tx| {
        Box::pin(async move {
            Ok(serde_json::json!({"tokensPerChar": 0.25}))
        })
    });
}
