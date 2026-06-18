//! JSON-RPC 2.0 协议类型（Electron ↔ Rust Sidecar）
//!
//! 通信方式：stdin/stdout，每行一个 JSON（newline-delimited JSON）
//! - 请求：Electron → Rust，有 id，Rust 返回 response
//! - 通知：Electron → Rust，无 id，Rust 不响应（用于无需返回值的方法如 shutdown）
//! - 流式事件：Rust → Electron，用通知格式推 Event（method = "event.xxx"）

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// JSON-RPC 请求（Electron → Rust）
#[derive(Debug, Clone, Deserialize)]
pub struct Request {
    pub jsonrpc: String,
    pub id: Option<u64>,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

/// JSON-RPC 成功响应（Rust → Electron）
#[derive(Debug, Serialize)]
pub struct Response {
    pub jsonrpc: &'static str,
    pub id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

/// JSON-RPC 错误详情
#[derive(Debug, Serialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

/// JSON-RPC 通知/事件（Rust → Electron，无 id，不期待响应）
#[derive(Debug, Serialize)]
pub struct Notification {
    pub jsonrpc: &'static str,
    pub method: String,
    pub params: Value,
}

impl Response {
    pub fn success(id: u64, result: Value) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn error(id: u64, code: i32, message: impl Into<String>) -> Self {
        Self {
            jsonrpc: "2.0",
            id,
            result: None,
            error: Some(RpcError {
                code,
                message: message.into(),
                data: None,
            }),
        }
    }

    pub fn method_not_found(id: u64, method: &str) -> Self {
        Self::error(id, -32601, format!("Method not found: {method}"))
    }

    pub fn invalid_params(id: u64, msg: impl Into<String>) -> Self {
        Self::error(id, -32602, msg)
    }

    pub fn internal_error(id: u64, msg: impl Into<String>) -> Self {
        Self::error(id, -32603, msg)
    }
}

impl Notification {
    /// 创建流式事件通知
    pub fn event(event_name: impl Into<String>, params: Value) -> Self {
        Self {
            jsonrpc: "2.0",
            method: format!("event.{}", event_name.into()),
            params,
        }
    }
}

impl Request {
    /// 是否为通知（无 id，不需要响应）
    pub fn is_notification(&self) -> bool {
        self.id.is_none()
    }

    /// 提取 params 中的某个字段
    pub fn param(&self, key: &str) -> Option<&Value> {
        self.params.get(key)
    }

    /// 提取并解析 string 参数
    pub fn param_str(&self, key: &str) -> Option<&str> {
        self.params.get(key)?.as_str()
    }

    /// 提取 params 中的数组
    pub fn param_array(&self, key: &str) -> Option<&Vec<Value>> {
        self.params.get(key)?.as_array()
    }
}

/// 所有 handler 的返回类型
pub type HandlerResult = Result<Value, RpcError>;
