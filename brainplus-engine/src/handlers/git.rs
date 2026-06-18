//! Git 操作 handler
//!
//! 替换 electron/main.ts 中的 spawnSync('git', args)，
//! 改用 tokio::process::Command 异步执行。

use crate::handlers::{OutputLine, Registry};
use crate::protocol::HandlerResult;
use std::path::Path;
use tokio::process::Command;
use tokio::sync::mpsc;

/// 执行 git 命令（通用）
async fn git_exec(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let cwd = req.param_str("cwd").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: cwd".into(),
            data: None,
        }
    })?;

    let args: Vec<String> = req
        .param_array("args")
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    if args.is_empty() {
        return Ok(serde_json::json!({
            "success": false,
            "error": "缺少必填参数: args"
        }));
    }

    let cwd_path = Path::new(cwd);
    if !cwd_path.is_dir() {
        return Ok(serde_json::json!({
            "success": false,
            "error": format!("目录不存在: {cwd}")
        }));
    }

    match Command::new("git")
        .args(&args)
        .current_dir(cwd_path)
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();

            if output.status.success() {
                Ok(serde_json::json!({
                    "success": true,
                    "output": stdout.trim().chars().take(50000).collect::<String>(),
                }))
            } else {
                Ok(serde_json::json!({
                    "success": false,
                    "error": stderr.trim().to_string(),
                    "output": stdout.trim().to_string(),
                }))
            }
        }
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": format!("git 命令执行失败: {e}"),
        })),
    }
}

/// git status（便捷方法，解析过的输出）
async fn git_status(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let cwd = req.param_str("cwd").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: cwd".into(),
            data: None,
        }
    })?;

    let cwd_path = Path::new(cwd);
    if !cwd_path.is_dir() {
        return Ok(serde_json::json!({
            "success": false,
            "error": format!("目录不存在: {cwd}")
        }));
    }

    // git status --porcelain 获取机器可读的状态
    match Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(cwd_path)
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let files: Vec<serde_json::Value> = stdout
                .lines()
                .filter(|l| !l.is_empty())
                .map(|line| {
                    let status = &line[..2].trim();
                    let file = line[3..].trim();
                    serde_json::json!({
                        "status": status,
                        "file": file,
                    })
                })
                .collect();

            Ok(serde_json::json!({
                "success": true,
                "files": files,
                "count": files.len(),
            }))
        }
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": format!("git status 执行失败: {e}"),
        })),
    }
}

/// git diff（便捷方法）
async fn git_diff(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let cwd = req.param_str("cwd").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: cwd".into(),
            data: None,
        }
    })?;

    let staged = req
        .params
        .get("staged")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let cwd_path = Path::new(cwd);

    let mut args = vec!["diff"];
    if staged {
        args.push("--staged");
    }

    match Command::new("git")
        .args(&args)
        .current_dir(cwd_path)
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            Ok(serde_json::json!({
                "success": true,
                "diff": stdout.trim().to_string(),
            }))
        }
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": format!("git diff 执行失败: {e}"),
        })),
    }
}

/// git log（便捷方法，最近 N 条）
async fn git_log(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let cwd = req.param_str("cwd").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: cwd".into(),
            data: None,
        }
    })?;

    let n = req
        .params
        .get("n")
        .and_then(|v| v.as_u64())
        .unwrap_or(10);

    let cwd_path = Path::new(cwd);

    match Command::new("git")
        .args([
            "log",
            "--oneline",
            "--decorate",
            "-n",
            &n.to_string(),
        ])
        .current_dir(cwd_path)
        .output()
        .await
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let commits: Vec<serde_json::Value> = stdout
                .lines()
                .filter(|l| !l.is_empty())
                .map(|line| {
                    let parts: Vec<&str> = line.splitn(2, ' ').collect();
                    serde_json::json!({
                        "hash": parts.first().unwrap_or(&""),
                        "message": parts.get(1).unwrap_or(&""),
                    })
                })
                .collect();

            Ok(serde_json::json!({
                "success": true,
                "commits": commits,
                "count": commits.len(),
            }))
        }
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": format!("git log 执行失败: {e}"),
        })),
    }
}

pub fn register(registry: &mut Registry) {
    registry.register("git.exec", |req, tx| Box::pin(git_exec(req, tx)));
    registry.register("git.status", |req, tx| Box::pin(git_status(req, tx)));
    registry.register("git.diff", |req, tx| Box::pin(git_diff(req, tx)));
    registry.register("git.log", |req, tx| Box::pin(git_log(req, tx)));
}
