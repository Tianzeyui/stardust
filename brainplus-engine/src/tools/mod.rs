//! 工具系统——对齐 src/lib/tools/*
//!
//! 所有工具直接在 Rust 中实现，不需要回叫 Electron。
//! AI 引擎通过 ToolRegistry 直接调用。

use crate::api::ToolDef;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// 工具执行函数签名
pub type ToolExecutor = Arc<
    dyn Fn(Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, String>> + Send>>
        + Send + Sync,
>;

/// 工具注册表
pub struct ToolRegistry {
    tools: HashMap<String, (ToolDef, ToolExecutor)>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self { tools: HashMap::new() }
    }

    /// 注册工具
    pub fn register<F, Fut>(&mut self, name: &str, description: &str, input_schema: Value, executor: F)
    where
        F: Fn(Value) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<String, String>> + Send + 'static,
    {
        let wrapped = Arc::new(move |input: Value| {
            Box::pin(executor(input))
                as std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, String>> + Send>>
        });
        self.tools.insert(name.to_string(), (
            ToolDef {
                name: name.to_string(),
                description: description.to_string(),
                input_schema,
            },
            wrapped,
        ));
    }

    /// 获取工具定义列表（给 AI 模型）
    pub fn definitions(&self) -> Vec<ToolDef> {
        self.tools.values().map(|(def, _)| def.clone()).collect()
    }

    /// 获取所有工具定义 + 执行器
    pub fn all(&self) -> &HashMap<String, (ToolDef, ToolExecutor)> {
        &self.tools
    }

    /// 执行工具
    pub async fn execute(&self, name: &str, input: Value) -> Result<String, String> {
        match self.tools.get(name) {
            Some((_, executor)) => executor(input).await,
            None => Err(format!("工具未找到: {name}")),
        }
    }
}
