//! 终端命令执行 & PTY handler
//!
//! 替换 electron/main.ts 中的 terminal:* IPC handler：
//! - terminal:execute  → terminal.exec      (同步等待，替代 spawn)
//! - terminal:spawn    → terminal.spawn     (异步流式输出)
//! - terminal:ptySpawn → terminal.ptySpawn  (交互式 PTY)
//! - terminal:ptyWrite → terminal.ptyWrite
//! - terminal:ptyResize → terminal.ptyResize
//! - terminal:kill     → terminal.kill
//! - terminal:check    → terminal.check

use crate::handlers::{emit, OutputLine, Registry};
use crate::protocol::HandlerResult;
use std::collections::HashMap;
use std::sync::Mutex as StdMutex;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::mpsc;

// ====== 进程追踪 ======

type PtyWriter = Box<dyn std::io::Write + Send>;

struct TrackedChild {
    /// PTY writer（take_writer 获取）
    pty_writer: Option<PtyWriter>,
    /// kill 句柄
    kill_tx: Option<tokio::sync::oneshot::Sender<()>>,
    /// 进程 PID
    pid: u32,
}

static PROCESSES: std::sync::LazyLock<StdMutex<HashMap<String, TrackedChild>>> =
    std::sync::LazyLock::new(|| StdMutex::new(HashMap::new()));

// ====== 命令执行（同步等待） ======

async fn terminal_exec(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let command = req.param_str("command").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: command".into(),
            data: None,
        }
    })?;
    let cwd = req.param_str("cwd").unwrap_or(".");

    let (shell, shell_arg) = if cfg!(target_os = "windows") {
        ("cmd.exe", "/c")
    } else {
        ("/bin/sh", "-c")
    };

    match Command::new(shell)
        .args([shell_arg, command])
        .current_dir(cwd)
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);

            Ok(serde_json::json!({
                "success": exit_code == 0,
                "stdout": stdout,
                "stderr": stderr,
                "exitCode": exit_code,
            }))
        }
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "stdout": "",
            "stderr": e.to_string(),
            "exitCode": -1,
        })),
    }
}

// ====== 异步命令执行（流式输出） ======

async fn terminal_spawn(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: id".into(),
            data: None,
        }
    })?.to_string();
    let command = req.param_str("command").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: command".into(),
            data: None,
        }
    })?;
    let cwd = req.param_str("cwd").unwrap_or(".");

    let (shell, shell_arg) = if cfg!(target_os = "windows") {
        ("cmd.exe", "/c")
    } else {
        ("/bin/sh", "-c")
    };

    let mut child = match Command::new(shell)
        .args([shell_arg, command])
        .current_dir(cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            return Ok(serde_json::json!({"success": false, "error": format!("启动失败: {e}")}));
        }
    };

    let pid = child.id().unwrap_or(0);
    let (kill_tx, mut kill_rx) = tokio::sync::oneshot::channel::<()>();

    // 注册进程
    {
        let mut procs = PROCESSES.lock().unwrap();
        procs.insert(id.clone(), TrackedChild {
            pty_writer: None,
            kill_tx: Some(kill_tx),
            pid,
        });
    }

    let pid_clone = id.clone();

    // 后台任务：读取 stdout/stderr + 等待退出
    tokio::spawn(async move {
        let mut stdout_buf = vec![0u8; 4096];
        let mut stderr_buf = vec![0u8; 4096];

        let mut stdout_reader = child.stdout.take();
        let mut stderr_reader = child.stderr.take();

        let mut exit_code: Option<i32> = None;

        #[allow(unused_assignments)]
        let mut _all_stdout = String::new();
        #[allow(unused_assignments)]
        let mut _all_stderr = String::new();

        // 简单轮询读取（后续可优化为 select!）
        loop {
            let mut did_read = false;

            if let Some(ref mut reader) = stdout_reader {
                match reader.read(&mut stdout_buf).await {
                    Ok(0) => { stdout_reader = None; }
                    Ok(n) => {
                        did_read = true;
                        let text = String::from_utf8_lossy(&stdout_buf[..n]).to_string();
                        _all_stdout.push_str(&text);
                        emit(&tx, "terminal.output", serde_json::json!({
                            "id": pid_clone,
                            "stdout": text,
                            "stderr": "",
                            "done": false,
                        }));
                    }
                    Err(_) => { stdout_reader = None; }
                }
            }

            if let Some(ref mut reader) = stderr_reader {
                match reader.read(&mut stderr_buf).await {
                    Ok(0) => { stderr_reader = None; }
                    Ok(n) => {
                        did_read = true;
                        let text = String::from_utf8_lossy(&stderr_buf[..n]).to_string();
                        _all_stderr.push_str(&text);
                        emit(&tx, "terminal.output", serde_json::json!({
                            "id": pid_clone,
                            "stdout": "",
                            "stderr": text,
                            "done": false,
                        }));
                    }
                    Err(_) => { stderr_reader = None; }
                }
            }

            // 检查进程是否退出
            if let Ok(Some(status)) = child.try_wait() {
                exit_code = status.code();
                break;
            }

            // 检查 kill 信号
            if kill_rx.try_recv().is_ok() {
                let _ = child.start_kill();
                exit_code = Some(-1);
                break;
            }

            if !did_read && stdout_reader.is_none() && stderr_reader.is_none() {
                // 等待进程退出
                match child.wait().await {
                    Ok(status) => {
                        exit_code = status.code();
                    }
                    Err(_) => {
                        exit_code = Some(-1);
                    }
                }
                break;
            }
        }

        // 最终输出事件
        emit(&tx, "terminal.output", serde_json::json!({
            "id": pid_clone,
            "stdout": "",
            "stderr": "",
            "done": true,
            "exitCode": exit_code.unwrap_or(-1),
        }));

        // 清理
        let mut procs = PROCESSES.lock().unwrap();
        procs.remove(&pid_clone);
    });

    Ok(serde_json::json!({ "success": true, "pid": pid }))
}

// ====== 进程终止 ======

async fn terminal_kill(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("").to_string();

    let mut procs = PROCESSES.lock().unwrap();
    if let Some(mut tracked) = procs.remove(&id) {
        if let Some(tx) = tracked.kill_tx.take() {
            let _ = tx.send(());
        }
        return Ok(serde_json::json!({ "success": true }));
    }

    Ok(serde_json::json!({ "success": false, "error": "进程未找到" }))
}

// ====== 进程状态查询 ======

async fn terminal_check(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("").to_string();

    let procs = PROCESSES.lock().unwrap();
    Ok(serde_json::json!({ "found": procs.contains_key(&id) }))
}

// ====== PTY 交互式终端 ======

async fn terminal_pty_spawn(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: id".into(),
            data: None,
        }
    })?.to_string();
    let command = req.param_str("command").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: command".into(),
            data: None,
        }
    })?;
    let cwd = req.param_str("cwd").unwrap_or(".");

    use portable_pty::{CommandBuilder, PtySize};

    let pty_system = portable_pty::native_pty_system();
    let pair = match pty_system.openpty(PtySize {
        rows: 30,
        cols: 120,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(p) => p,
        Err(e) => {
            return Ok(serde_json::json!({
            "success": false,
            "error": format!("创建 PTY 失败: {e}"),
            }));
        }
    };

    // Clone reader（读取 PTY 输出）
    let reader = match pair.master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            return Ok(serde_json::json!({
            "success": false,
            "error": format!("PTY reader 创建失败: {e}"),
            }));
        }
    };
    // take_writer 从 master 中提取 Write handle
    let writer: PtyWriter = match pair.master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            return Ok(serde_json::json!({
            "success": false,
            "error": format!("PTY writer 创建失败: {e}"),
            }));
        }
    };

    let mut cmd = CommandBuilder::new(command);
    cmd.cwd(cwd);
    let mut child = match pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(e) => {
            return Ok(serde_json::json!({
                "success": false,
                "error": format!("PTY 启动命令失败: {e}"),
            }));
        }
    };

    let pid = child.process_id().unwrap_or(0);

    // 注册
    {
        let mut procs = PROCESSES.lock().unwrap();
        procs.insert(id.clone(), TrackedChild {
            pty_writer: Some(writer),
            kill_tx: None,
            pid,
        });
    }

    let pid_clone = id.clone();

    // 后台任务：读取 PTY 输出（sync read → spawn_blocking）→ 流式推送
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    emit(&tx, "pty.output", serde_json::json!({
                        "id": pid_clone,
                        "data": data,
                        "done": false,
                    }));
                }
                Err(_) => break,
            }
        }
        emit(&tx, "pty.output", serde_json::json!({
            "id": pid_clone,
            "data": "\n\x1b[33m[PTY 已关闭]\x1b[0m\n",
            "done": true,
            "exitCode": 0,
        }));
        let mut procs = PROCESSES.lock().unwrap();
        procs.remove(&pid_clone);
    });

    // 等待子进程退出（不阻塞）
    tokio::spawn(async move {
        let _ = child.wait();
    });

    Ok(serde_json::json!({ "success": true, "pid": pid }))
}

async fn terminal_pty_write(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("").to_string();
    let data = req.param_str("data").unwrap_or("");

    let mut procs = PROCESSES.lock().unwrap();
    if let Some(tracked) = procs.get_mut(&id) {
        if let Some(ref mut writer) = tracked.pty_writer {
            use std::io::Write;
            match writer.write_all(data.as_bytes()) {
                Ok(()) => {
                    let _ = writer.flush();
                    return Ok(serde_json::json!({ "success": true }));
                }
                Err(e) => {
                    return Ok(serde_json::json!({
                        "success": false,
                        "error": format!("PTY 写入失败: {e}"),
                    }));
                }
            }
        }
    }
    Ok(serde_json::json!({ "success": false, "error": "PTY 进程不存在" }))
}

async fn terminal_pty_resize(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("").to_string();
    let cols = req.params.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
    let rows = req.params.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;

    let mut procs = PROCESSES.lock().unwrap();
    if let Some(tracked) = procs.get_mut(&id) {
        if let Some(ref mut writer) = tracked.pty_writer {
            use std::io::Write;
            let resize_cmd = format!("\x1b[8;{};{}t", rows, cols);
            let _ = writer.write_all(resize_cmd.as_bytes());
            let _ = writer.flush();
        }
    }

    Ok(serde_json::json!({ "ok": true }))
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("terminal.exec", |req, tx| Box::pin(terminal_exec(req, tx)));
    registry.register("terminal.spawn", |req, tx| Box::pin(terminal_spawn(req, tx)));
    registry.register("terminal.kill", |req, tx| Box::pin(terminal_kill(req, tx)));
    registry.register("terminal.check", |req, tx| Box::pin(terminal_check(req, tx)));
    registry.register("terminal.ptySpawn", |req, tx| Box::pin(terminal_pty_spawn(req, tx)));
    registry.register("terminal.ptyWrite", |req, tx| Box::pin(terminal_pty_write(req, tx)));
    registry.register("terminal.ptyResize", |req, tx| Box::pin(terminal_pty_resize(req, tx)));
}
