//! 统一错误类型

use thiserror::Error;

#[derive(Error, Debug)]
pub enum EngineError {
    #[error("文件不存在: {0}")]
    FileNotFound(String),

    #[error("不是文件: {0}")]
    NotAFile(String),

    #[error("不是目录: {0}")]
    NotADir(String),

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("序列化错误: {0}")]
    Json(#[from] serde_json::Error),

    #[error("正则错误: {0}")]
    Regex(#[from] regex::Error),

    #[error("超时: {0}")]
    Timeout(String),

    #[error("权限不足: {0}")]
    PermissionDenied(String),

    #[error("{0}")]
    Other(String),
}

impl From<walkdir::Error> for EngineError {
    fn from(e: walkdir::Error) -> Self {
        EngineError::Io(e.into())
    }
}
