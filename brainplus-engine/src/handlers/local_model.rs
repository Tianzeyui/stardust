//! 本地模型管理 handler
//! 替换 electron/main/localModelManager.ts + localInference.ts

use crate::handlers::{emit, OutputLine, Registry};
use crate::protocol::HandlerResult;
use std::path::PathBuf;
use tokio::sync::mpsc;

// ====== 可用模型目录 ======

fn models_dir() -> PathBuf { dirs::home_dir().unwrap_or_default().join(".brainplus/models") }
fn model_path(id: &str) -> PathBuf { models_dir().join(id) }

fn available_models() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({"id":"qwen2.5-coder-1.5b","name":"Qwen 2.5 Coder 1.5B","size":"~1GB","url":"https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"}),
        serde_json::json!({"id":"deepseek-coder-1.3b","name":"DeepSeek Coder 1.3B","size":"~800MB","url":"https://huggingface.co/deepseek-ai/deepseek-coder-1.3b-instruct-GGUF/resolve/main/deepseek-coder-1.3b-instruct.Q4_K_M.gguf"}),
        serde_json::json!({"id":"phi-3-mini","name":"Phi-3 Mini 3.8B","size":"~2.3GB","url":"https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf"}),
    ]
}

// ====== 状态 ======

async fn model_get_status(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let available = available_models();
    let _dir = models_dir();

    let status: Vec<serde_json::Value> = available.iter().map(|m| {
        let id = m["id"].as_str().unwrap_or("");
        let gguf_path = model_path(id);
        let installed = gguf_path.exists();

        let mut entry = m.clone();
        entry.as_object_mut().map(|obj| {
            obj.insert("installed".into(), serde_json::Value::Bool(installed));
            obj.insert("enabled".into(), serde_json::Value::Bool(true));
        });
        entry
    }).collect();

    Ok(serde_json::json!(status))
}

async fn model_is_installed(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("");
    Ok(serde_json::json!(model_path(id).exists()))
}

// ====== 下载 ======

async fn model_download(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").ok_or_else(|| {
        crate::protocol::RpcError { code: -32602, message: "缺少必填参数: id".into(), data: None }
    })?;

    let model = available_models().into_iter().find(|m| m["id"] == id);
    let url = match model.as_ref().and_then(|m| m["url"].as_str()) {
        Some(u) => u.to_string(),
        None => return Ok(serde_json::json!({"success": false, "error": format!("未知模型: {id}")})),
    };

    let dest = model_path(id);
    if dest.exists() {
        return Ok(serde_json::json!({"success": true, "cached": true}));
    }

    // 确保目录存在
    let _ = std::fs::create_dir_all(models_dir());

    // HTTP 下载（先到内存，再写文件 — 避免跨线程 Send 问题）
    let client = reqwest::Client::new();
    let response = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => return Ok(serde_json::json!({"success": false, "error": format!("下载失败: {e}")})),
    };

    let total = response.content_length().unwrap_or(0);
    emit(&tx, "model.downloadProgress", serde_json::json!({
        "id": id, "loaded": 0, "total": total,
    }));

    match response.bytes().await {
        Ok(data) => {
            match tokio::fs::write(&dest, &data).await {
                Ok(()) => {
                    emit(&tx, "model.downloadProgress", serde_json::json!({
                        "id": id, "loaded": total, "total": total,
                    }));
                }
                Err(e) => {
                    return Ok(serde_json::json!({"success": false, "error": format!("写入文件失败: {e}")}));
                }
            }
        }
        Err(e) => {
            return Ok(serde_json::json!({"success": false, "error": format!("下载中断: {e}")}));
        }
    }

    emit(&tx, "model.downloadDone", serde_json::json!({"id": id, "success": true}));
    Ok(serde_json::json!({"success": true}))
}

// ====== 删除 ======

async fn model_delete(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("");
    let path = model_path(id);
    if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    Ok(serde_json::json!({"success": true}))
}

// ====== 切换启用 ======

async fn model_toggle_enabled(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let _id = req.param_str("id").unwrap_or("");
    // 简化实现：始终返回 true
    Ok(serde_json::json!(true))
}

async fn model_open_dir(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let dir = models_dir();
    let _ = std::fs::create_dir_all(&dir);
    let _ = open::that(&dir);
    Ok(serde_json::json!(true))
}

// ====== 推理 ======

async fn model_load(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("");
    let path = model_path(id);
    if !path.exists() {
        return Ok(serde_json::json!({"success": false, "error": "模型未下载"}));
    }
    Ok(serde_json::json!({"success": true}))
}

async fn model_unload(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    crate::inference::unload_model();
    Ok(serde_json::json!(true))
}

/// 流式推理——对齐 model:chat IPC handler
async fn model_chat(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let id = req.param_str("id").unwrap_or("");
    let messages: Vec<serde_json::Value> = req.params.get("messages")
        .and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let path = model_path(id);
    if !path.exists() {
        emit(&tx, "model.chatError", serde_json::json!({"error": format!("模型未下载: {id}")}));
        return Ok(serde_json::json!({"success": false, "error": "模型未下载"}));
    }

    let path_str = path.to_string_lossy().to_string();
    emit(&tx, "model.chatLoading", serde_json::json!({"modelId": id}));

    // 后台任务：执行推理（可能耗时数十秒）
    let tx_clone = tx.clone();
    let id_clone = id.to_string();
    tokio::task::spawn_blocking(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            if let Err(e) = crate::inference::stream_inference(
                &id_clone, &path_str, &messages, 2048, tx_clone.clone(),
            ).await {
                emit(&tx_clone, "model.chatError", serde_json::json!({"error": e}));
            }
        });
    });

    Ok(serde_json::json!({"success": true}))
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("model.getStatus", |req, tx| Box::pin(model_get_status(req, tx)));
    registry.register("model.isInstalled", |req, tx| Box::pin(model_is_installed(req, tx)));
    registry.register("model.download", |req, tx| Box::pin(model_download(req, tx)));
    registry.register("model.delete", |req, tx| Box::pin(model_delete(req, tx)));
    registry.register("model.toggleEnabled", |req, tx| Box::pin(model_toggle_enabled(req, tx)));
    registry.register("model.openDir", |req, tx| Box::pin(model_open_dir(req, tx)));
    registry.register("model.load", |req, tx| Box::pin(model_load(req, tx)));
    registry.register("model.unload", |req, tx| Box::pin(model_unload(req, tx)));
    registry.register("model.chat", |req, tx| Box::pin(model_chat(req, tx)));
}
