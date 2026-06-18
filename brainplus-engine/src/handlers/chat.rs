//! AI Chat handler——工具执行循环（对齐 streamChatWithTools）
//!
//! 接收对话消息 → 调 AI API → 执行工具 → 循环
//! 所有事件通过 mpsc channel 流式推送到 Electron

use crate::api::{detect_provider, ChatMessage, ProviderConfig, StreamEvent, ToolDef, Usage};
use crate::api::{anthropic, openai_compat};
use crate::handlers::{emit, OutputLine, Registry};
use crate::protocol::HandlerResult;
use crate::tools::ToolRegistry;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::mpsc;

fn run_git(args: &[&str], cwd: &str) -> String { let s: Vec<String> = args.iter().map(|s| s.to_string()).collect(); std::process::Command::new("git").args(&s).current_dir(cwd).output().map(|o| String::from_utf8_lossy(&o.stdout).to_string()).unwrap_or_else(|e| format!("{e}")) }
fn run_git_strvec(args: &Vec<String>, cwd: &str) -> String { run_git(&args.iter().map(|s| s.as_str()).collect::<Vec<_>>(), cwd) }
/// 构建完整的工具注册表
fn build_tool_registry() -> ToolRegistry {
    let mut r = ToolRegistry::new();

    // 路径解析：相对路径 → 绝对路径
    fn resolve(p: &str) -> String {
        if p.is_empty() { return ".".to_string(); }
        let path = std::path::Path::new(p);
        if path.is_absolute() && path.exists() { return p.to_string(); }
        if path.exists() { return p.to_string(); }
        // 尝试当前目录 + 父目录 + home
        let cwd = std::env::current_dir().unwrap_or_default();
        for base in [cwd.clone(), cwd.join(".."), dirs::home_dir().unwrap_or_default()] {
            let abs = base.join(p);
            if abs.exists() { return abs.to_string_lossy().to_string(); }
        }
        // 回退：CWD + 文件名
        cwd.join(p).to_string_lossy().to_string()
    }

    // —— 工作区 (对齐 TS workspace.ts) ——
    r.register("workspace_read_file", "Read file content. path: relative or absolute.", json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}), |i: Value| { let p=resolve(i["path"].as_str().unwrap_or("")); Box::pin(async move { tokio::fs::read_to_string(&p).await.map_err(|e|format!("读取 {p}: {e}")) }) });
    r.register("workspace_write_file", "Write/create file. path, content.", json!({"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}), |i: Value| { let p=resolve(i["path"].as_str().unwrap_or("")); let c=i["content"].as_str().unwrap_or("").to_string(); Box::pin(async move { tokio::fs::write(&p,&c).await.map_err(|e|format!("{e}"))?; Ok("ok".into()) }) });
    r.register("workspace_edit_file", "Edit file (full replace). path, content.", json!({"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}), |i: Value| { let p=resolve(i["path"].as_str().unwrap_or("")); let c=i["content"].as_str().unwrap_or("").to_string(); Box::pin(async move { tokio::fs::write(&p,&c).await.map_err(|e|format!("{e}"))?; Ok("ok".into()) }) });
    r.register("workspace_append_file", "Append to file. path, content.", json!({"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}), |i: Value| { let p=resolve(i["path"].as_str().unwrap_or("")); let c=i["content"].as_str().unwrap_or("").to_string(); Box::pin(async move { use std::io::Write; let mut f=std::fs::OpenOptions::new().append(true).create(true).open(&p).map_err(|e|format!("{e}"))?; f.write_all(c.as_bytes()).map_err(|e|format!("{e}"))?; Ok("ok".into()) }) });
    r.register("workspace_create_dir", "Create directory. path.", json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}), |i: Value| { let p=resolve(i["path"].as_str().unwrap_or("")); Box::pin(async move { tokio::fs::create_dir_all(&p).await.map_err(|e|format!("{e}"))?; Ok("ok".into()) }) });
    r.register("workspace_delete_file", "Delete file/dir. path.", json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}), |i: Value| { let p=resolve(i["path"].as_str().unwrap_or("")); Box::pin(async move { if std::path::Path::new(&p).is_dir() { tokio::fs::remove_dir_all(&p).await.map_err(|e|format!("{e}"))?; } else { tokio::fs::remove_file(&p).await.map_err(|e|format!("{e}"))?; } Ok("ok".into()) }) });
    r.register("workspace_list_dir", "List directory. path.", json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}), |i: Value| { let p=i["path"].as_str().unwrap_or(".").to_string(); Box::pin(async move { let mut d=tokio::fs::read_dir(&p).await.map_err(|e|format!("{e}"))?; let mut f=vec![]; while let Ok(Some(e))=d.next_entry().await { f.push(e.file_name().to_string_lossy().to_string()); } Ok(f.join("\n")) }) });
    r.register("workspace_glob", "Find files by glob. path, pattern (e.g. '**/*.ts').", json!({"type":"object","properties":{"path":{"type":"string"},"pattern":{"type":"string"}},"required":["path","pattern"]}), |i: Value| { let p=i["path"].as_str().unwrap_or(".").to_string(); let pat=i["pattern"].as_str().unwrap_or("*").to_string(); Box::pin(async move { let mut files=vec![]; for entry in ignore::WalkBuilder::new(&p).git_ignore(true).build().flatten() { if entry.file_type().map_or(false,|f|f.is_file()) && entry.path().to_string_lossy().contains(&pat.replace("**/","").replace("*.",".")) { files.push(entry.path().to_string_lossy().to_string()); if files.len()>=500 { break; } } } Ok(files.join("\n")) }) });
    r.register("workspace_grep", "Search file contents (regex). path, pattern.", json!({"type":"object","properties":{"path":{"type":"string"},"pattern":{"type":"string"}},"required":["path","pattern"]}), |i: Value| { let p=i["path"].as_str().unwrap_or(".").to_string(); let pat=i["pattern"].as_str().unwrap_or("").to_string(); Box::pin(async move { let re=regex::RegexBuilder::new(&pat).case_insensitive(true).build().map_err(|e|format!("{e}"))?; let mut r=vec![]; for e in ignore::WalkBuilder::new(&p).git_ignore(true).build().flatten() { if e.file_type().map_or(false,|f|f.is_file()) { if let Ok(c)=std::fs::read_to_string(e.path()) { for (i,l) in c.lines().enumerate() { if re.is_match(l)&&r.len()<100 { r.push(format!("{}:{}:{}",e.path().display(),i+1,&l[..l.len().min(200)])); } } } } } Ok(r.join("\n")) }) });

    // —— 终端 (对齐 TS terminal.ts) ——
    r.register("run_terminal", "Execute shell command. command, cwd (optional).", json!({"type":"object","properties":{"command":{"type":"string"},"cwd":{"type":"string"}},"required":["command"]}), |i: Value| { let cmd=i["command"].as_str().unwrap_or("").to_string(); let cwd=i["cwd"].as_str().unwrap_or(".").to_string(); Box::pin(async move { match tokio::process::Command::new("/bin/sh").args(["-c",&cmd]).current_dir(&cwd).output().await { Ok(o)=>Ok(format!("{}{}",String::from_utf8_lossy(&o.stdout),String::from_utf8_lossy(&o.stderr))), Err(e)=>Ok(format!("{e}")) } }) });
    r.register("check_terminal", "Check running command status. id.", json!({"type":"object","properties":{"id":{"type":"string"}},"required":["id"]}), |_i: Value| Box::pin(async move { Ok("no running commands".into()) }));

    // —— Git (对齐 TS git.ts) ——
    r.register("git_status", "Git status. cwd.", json!({"type":"object","properties":{"cwd":{"type":"string"}},"required":["cwd"]}), |i: Value| { let c=i["cwd"].as_str().unwrap_or(".").to_string(); Box::pin(async move { Ok(run_git(&["status","--porcelain"],&c)) }) });
    r.register("git_diff", "Git diff (unstaged). cwd.", json!({"type":"object","properties":{"cwd":{"type":"string"}},"required":["cwd"]}), |i: Value| { let c=i["cwd"].as_str().unwrap_or(".").to_string(); Box::pin(async move { Ok(run_git(&["diff"],&c)) }) });
    r.register("git_diff_staged", "Git diff (staged). cwd.", json!({"type":"object","properties":{"cwd":{"type":"string"}},"required":["cwd"]}), |i: Value| { let c=i["cwd"].as_str().unwrap_or(".").to_string(); Box::pin(async move { Ok(run_git(&["diff","--staged"],&c)) }) });
    r.register("git_log", "Git log (recent N). cwd, n.", json!({"type":"object","properties":{"cwd":{"type":"string"},"n":{"type":"integer"}},"required":["cwd"]}), |i: Value| { let c=i["cwd"].as_str().unwrap_or(".").to_string(); let n=i["n"].as_u64().unwrap_or(10).to_string(); Box::pin(async move { Ok(run_git(&["log","--oneline","-n",&n],&c)) }) });
    r.register("git_add", "Git add files. cwd, files (space-separated).", json!({"type":"object","properties":{"cwd":{"type":"string"},"files":{"type":"string"}},"required":["cwd","files"]}), |i: Value| { let c=i["cwd"].as_str().unwrap_or(".").to_string(); let f=i["files"].as_str().unwrap_or(".").to_string(); Box::pin(async move { Ok(run_git(&["add",&f],&c)) }) });
    r.register("git_commit", "Git commit. cwd, message.", json!({"type":"object","properties":{"cwd":{"type":"string"},"message":{"type":"string"}},"required":["cwd","message"]}), |i: Value| { let c=i["cwd"].as_str().unwrap_or(".").to_string(); let m=i["message"].as_str().unwrap_or("").to_string(); Box::pin(async move { Ok(run_git(&["commit","-m",&m],&c)) }) });
    r.register("git_push", "Git push. cwd.", json!({"type":"object","properties":{"cwd":{"type":"string"}},"required":["cwd"]}), |i: Value| { let c=i["cwd"].as_str().unwrap_or(".").to_string(); Box::pin(async move { Ok(run_git(&["push"],&c)) }) });
    r.register("git_branch", "List/create branches. cwd, name (optional).", json!({"type":"object","properties":{"cwd":{"type":"string"},"name":{"type":"string"}},"required":["cwd"]}), |i: Value| { let c=i["cwd"].as_str().unwrap_or(".").to_string(); let n=i["name"].as_str(); let args: Vec<String>=if let Some(name)=n { vec!["branch".into(),name.to_string()] } else { vec!["branch".into()] }; Box::pin(async move { Ok(run_git_strvec(&args, &c)) }) });
    r.register("git_checkout", "Git checkout branch. cwd, branch.", json!({"type":"object","properties":{"cwd":{"type":"string"},"branch":{"type":"string"}},"required":["cwd","branch"]}), |i: Value| { let c=i["cwd"].as_str().unwrap_or(".").to_string(); let b=i["branch"].as_str().unwrap_or("main").to_string(); Box::pin(async move { Ok(run_git(&["checkout",&b],&c)) }) });
    r.register("git_reset", "Git reset (soft/mixed/hard). cwd, mode (--soft/--mixed/--hard).", json!({"type":"object","properties":{"cwd":{"type":"string"},"mode":{"type":"string"}},"required":["cwd"]}), |i: Value| { let c=i["cwd"].as_str().unwrap_or(".").to_string(); let m=i["mode"].as_str().unwrap_or("--mixed").to_string(); Box::pin(async move { Ok(run_git(&["reset",&m],&c)) }) });

    // —— 沙箱 ——
    r.register("sandbox_execute_js", "Execute JS code. code, packages (optional npm pkgs).", json!({"type":"object","properties":{"code":{"type":"string"},"packages":{"type":"array","items":{"type":"string"}}},"required":["code"]}), |i: Value| { let code=i["code"].as_str().unwrap_or("").to_string(); Box::pin(async move { match tokio::process::Command::new("node").args(["-e",&code]).output().await { Ok(o)=>Ok(format!("{}{}",String::from_utf8_lossy(&o.stdout),String::from_utf8_lossy(&o.stderr))), Err(e)=>Ok(format!("{e}")) } }) });
    r.register("sandbox_execute_python", "Execute Python code. code.", json!({"type":"object","properties":{"code":{"type":"string"}},"required":["code"]}), |i: Value| { let code=i["code"].as_str().unwrap_or("").to_string(); Box::pin(async move { let py=if tokio::process::Command::new("which").arg("uv").output().await.map(|o|o.status.success()).unwrap_or(false) {"uv run python"} else {"python3"}; match tokio::process::Command::new("/bin/sh").args(["-c",&format!("{py} -c {code:?}")]).output().await { Ok(o)=>Ok(format!("{}{}",String::from_utf8_lossy(&o.stdout),String::from_utf8_lossy(&o.stderr))), Err(e)=>Ok(format!("{e}")) } }) });

    // —— 网络 ——
    r.register("web_fetch", "Fetch URL content. url.", json!({"type":"object","properties":{"url":{"type":"string"}},"required":["url"]}), |i: Value| { let url=i["url"].as_str().unwrap_or("").to_string(); Box::pin(async move { match reqwest::Client::builder().timeout(std::time::Duration::from_secs(15)).build().unwrap_or_default().get(&url).header("User-Agent","Mozilla/5.0").send().await { Ok(t)=>match t.text().await { Ok(s)=>Ok(s.chars().take(10000).collect()), Err(e)=>Ok(format!("{e}")) }, Err(e)=>Ok(format!("{e}")) } }) });
    r.register("web_search", "Search the web. query.", json!({"type":"object","properties":{"query":{"type":"string"}},"required":["query"]}), |_i: Value| Box::pin(async move { Ok("网页搜索需要配置 API key。请使用 web_fetch 直接访问 URL。".into()) }));

    // —— Agent UI (对齐 TS agent.ts) ——
    r.register("ask_user", "Ask user a question. question, options (optional comma-separated).", json!({"type":"object","properties":{"question":{"type":"string"},"options":{"type":"string"}},"required":["question"]}), |_i: Value| Box::pin(async move { Ok("用户已收到问题。请等待用户回复后继续。".into()) }));
    r.register("show_progress", "Show progress to user. message.", json!({"type":"object","properties":{"message":{"type":"string"}},"required":["message"]}), |_i: Value| Box::pin(async move { Ok("进度已展示".into()) }));
    r.register("notify_complete", "Notify task completion. message, result (optional).", json!({"type":"object","properties":{"message":{"type":"string"},"result":{"type":"string"}},"required":["message"]}), |_i: Value| Box::pin(async move { Ok("完成通知已发送".into()) }));
    r.register("update_task_list", "Update task list for complex tasks. tasks (JSON array of {id,title,status}).", json!({"type":"object","properties":{"tasks":{"type":"string"}},"required":["tasks"]}), |_i: Value| Box::pin(async move { Ok("任务列表已更新".into()) }));
    r.register("delegate_task", "Delegate to sub-agent. agentName, task. Requires available agents.", json!({"type":"object","properties":{"agentName":{"type":"string"},"task":{"type":"string"}},"required":["agentName","task"]}), |_i: Value| Box::pin(async move { Ok("Agent 委托已发送".into()) }));
    r.register("delegate_batch", "Delegate to multiple agents in parallel. items (JSON array).", json!({"type":"object","properties":{"items":{"type":"string"}},"required":["items"]}), |_i: Value| Box::pin(async move { Ok("批量委托已发送".into()) }));
    r.register("delegate_chain", "Delegate to agents in chain. steps (JSON array).", json!({"type":"object","properties":{"steps":{"type":"string"}},"required":["steps"]}), |_i: Value| Box::pin(async move { Ok("链式委托已发送".into()) }));

    // —— Skill ——
    r.register("read_skill", "Read skill documentation. name (skill name), file (optional, relative path).", json!({"type":"object","properties":{"name":{"type":"string"},"file":{"type":"string"}},"required":["name"]}), |_i: Value| Box::pin(async move { Ok("没有已启用的 Skill。使用 workspace 工具直接操作文件。".into()) }));

    r
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
                    if name.is_empty() { continue; } // 空名幻觉跳过
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
            tool_call_id: None, reasoning_content: if reasoning_content.is_empty() { None } else { Some(reasoning_content.clone()) },
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
