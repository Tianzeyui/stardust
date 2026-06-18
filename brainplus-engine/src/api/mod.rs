//! AI API 层——多提供商路由 + 流式 SSE 解析
//! 对齐 src/lib/api/index.ts 的 streamChat / streamChatWithTools

pub mod anthropic;
pub mod openai_compat;

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ====== 类型 ======

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub name: String,
    pub input: Value,
}

#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub provider: String,
    pub model_id: String,
    pub api_key: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Clone)]
pub enum StreamEvent {
    TextDelta { text: String },
    ReasoningDelta { text: String },
    ToolCallStart { id: String, name: String, input: Value },
    ToolResult { tool_name: String, tool_output: String },
    Done { finish_reason: String, input_tokens: u32, output_tokens: u32 },
}

#[derive(Debug, Clone)]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

// ====== 提供商检测 ======

pub fn detect_provider(config: &ProviderConfig) -> &str {
    let name = config.provider.to_lowercase();
    if name.contains("anthropic") || name.contains("claude") || name.contains("bedrock") || name.contains("vertex") {
        "anthropic"
    } else {
        "openai-compat"
    }
}
