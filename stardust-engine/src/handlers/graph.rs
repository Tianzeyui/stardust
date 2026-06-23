//! Neo4j 图数据库 handler
//! 替换 electron/main/graphService.ts — 纯 HTTP 请求到 Neo4j REST API

use crate::handlers::{OutputLine, Registry};
use crate::protocol::HandlerResult;
use std::sync::Mutex;
use tokio::sync::mpsc;

static GRAPH_CONFIG: Mutex<Option<GraphConfig>> = Mutex::new(None);

struct GraphConfig {
    uri: String,
    username: String,
    password: String,
}

// ====== 配置 ======

async fn graph_configure(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let uri = req.param_str("uri").unwrap_or("");
    let username = req.param_str("username").unwrap_or("");
    let password = req.param_str("password").unwrap_or("");

    let mut cfg = GRAPH_CONFIG.lock().unwrap();
    *cfg = Some(GraphConfig {
        uri: uri.to_string(),
        username: username.to_string(),
        password: password.to_string(),
    });

    Ok(serde_json::json!({"success": true}))
}

async fn graph_get_config(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let cfg = GRAPH_CONFIG.lock().unwrap();
    match &*cfg {
        Some(c) => Ok(serde_json::json!({
            "uri": c.uri, "username": c.username, "hasPassword": !c.password.is_empty(),
        })),
        None => Ok(serde_json::json!({"uri": "", "username": "", "hasPassword": false})),
    }
}

// ====== 连接测试 ======

async fn graph_test_connection(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let (url, auth) = {
        let cfg = GRAPH_CONFIG.lock().unwrap();
        let config = match &*cfg {
            Some(c) => c,
            None => return Ok(serde_json::json!({"success": false, "error": "未配置数据库连接"})),
        };
        let url = format!("{}/db/neo4j/tx/commit", config.uri.trim_end_matches('/'));
        let auth = base64_encode(&format!("{}:{}", config.username, config.password));
        (url, auth)
    };
    // Mutex guard dropped here — safe to await

    let client = reqwest::Client::new();

    match client.post(&url)
        .header("Authorization", format!("Basic {auth}"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "statements": [{"statement": "RETURN 1 as test"}]
        }))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(res) => {
            let status = res.status().as_u16();
            if res.status().is_success() {
                Ok(serde_json::json!({"success": true}))
            } else {
                let body = res.text().await.unwrap_or_default();
                Ok(serde_json::json!({"success": false, "error": format!("HTTP {status}: {}", body.chars().take(200).collect::<String>())}))
            }
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

// ====== Cypher 查询 ======

async fn graph_query(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let cypher = req.param_str("cypher").unwrap_or("");
    if cypher.is_empty() {
        return Ok(serde_json::json!({"success": false, "error": "查询语句为空"}));
    }

    let (url, auth) = {
        let cfg = GRAPH_CONFIG.lock().unwrap();
        let config = match &*cfg {
            Some(c) => c,
            None => return Ok(serde_json::json!({"success": false, "error": "未配置数据库连接"})),
        };
        let url = format!("{}/db/neo4j/tx/commit", config.uri.trim_end_matches('/'));
        let auth = base64_encode(&format!("{}:{}", config.username, config.password));
        (url, auth)
    };
    // Mutex guard dropped — safe to await

    let client = reqwest::Client::new();

    match client.post(&url)
        .header("Authorization", format!("Basic {auth}"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "statements": [{"statement": cypher}]
        }))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
    {
        Ok(res) => {
            match res.json::<serde_json::Value>().await {
                Ok(json) => Ok(serde_json::json!({"success": true, "data": json})),
                Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
            }
        }
        Err(e) => Ok(serde_json::json!({"success": false, "error": e.to_string()})),
    }
}

fn base64_encode(input: &str) -> String {
    use base64::engine::general_purpose::STANDARD;
    use std::io::Write;
    let mut enc = base64::write::EncoderStringWriter::new(&STANDARD);
    let _ = enc.write_all(input.as_bytes());
    enc.into_inner()
}

// ====== 关闭 ======

async fn graph_close(_req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let mut cfg = GRAPH_CONFIG.lock().unwrap();
    *cfg = None;
    Ok(serde_json::json!({"ok": true}))
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("graph.configure", |req, tx| Box::pin(graph_configure(req, tx)));
    registry.register("graph.getConfig", |req, tx| Box::pin(graph_get_config(req, tx)));
    registry.register("graph.testConnection", |req, tx| Box::pin(graph_test_connection(req, tx)));
    registry.register("graph.query", |req, tx| Box::pin(graph_query(req, tx)));
    registry.register("graph.close", |req, tx| Box::pin(graph_close(req, tx)));
}
