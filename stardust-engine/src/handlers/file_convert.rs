//! 文件类型检测 & 文档转换 handler
//!
//! 替换 electron/main/fileConvert.ts：
//! - file:checkType → file.checkType
//! - file:convert   → file.convert
//!
//! 转换策略：
//! - .txt/.md/.json/.csv → 直接读取
//! - .doc/.docx/.xls/.xlsx/.ppt/.pptx/.pdf → 尝试 markitdown/pandoc

use crate::handlers::{emit, OutputLine, Registry};
use crate::protocol::HandlerResult;
use std::path::Path;
use tokio::process::Command;
use tokio::sync::mpsc;

const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"];
const CONVERTIBLE_EXTS: &[&str] = &["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "csv", "txt", "md", "json"];

// ====== 文件类型检测 ======

async fn file_check_type(req: crate::protocol::Request, _tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let file_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;

    let path = Path::new(file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let is_image = IMAGE_EXTS.contains(&ext.as_str());
    let is_convertible = CONVERTIBLE_EXTS.contains(&ext.as_str());

    Ok(serde_json::json!({
        "isImage": is_image,
        "isConvertible": is_convertible,
    }))
}

// ====== 文档转换 ======

async fn file_convert(req: crate::protocol::Request, tx: mpsc::Sender<OutputLine>) -> HandlerResult {
    let file_path = req.param_str("path").ok_or_else(|| {
        crate::protocol::RpcError {
            code: -32602,
            message: "缺少必填参数: path".into(),
            data: None,
        }
    })?;

    let path = Path::new(file_path);
    if !path.exists() {
        return Ok(serde_json::json!({
            "success": false,
            "error": format!("文件不存在: {file_path}"),
        }));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // 纯文本文件：直接读取
    if ["txt", "md", "json", "csv", "xml", "html", "htm", "css", "js", "ts", "tsx", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "yaml", "yml", "toml", "ini", "cfg", "log"].contains(&ext.as_str()) {
        return convert_text_file(path).await;
    }

    // 图片文件：返回 markdown 图片链接
    if IMAGE_EXTS.contains(&ext.as_str()) {
        return Ok(serde_json::json!({
            "success": true,
            "result": format!("![图片]({file_path})"),
        }));
    }

    // Office/PDF 文件：尝试 markitdown 或 pandoc
    emit(&tx, "file.convertProgress", serde_json::json!({
        "filePath": file_path,
        "message": "正在转换文档...",
    }));

    // 先试 markitdown (Python 包)
    if let Ok(result) = try_markitdown(file_path).await {
        return Ok(result);
    }

    // 回退：pandoc
    if let Ok(result) = try_pandoc(file_path).await {
        return Ok(result);
    }

    // 最终回退：返回基本信息
    let meta = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    Ok(serde_json::json!({
        "success": true,
        "result": format!("[文件: {file_path}]\n类型: {ext}\n大小: {meta} 字节\n\n(未安装 markitdown 或 pandoc，无法转换此格式)"),
    }))
}

async fn convert_text_file(path: &Path) -> HandlerResult {
    match tokio::fs::read_to_string(path).await {
        Ok(content) => Ok(serde_json::json!({
            "success": true,
            "result": content,
        })),
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "error": format!("读取文件失败: {e}"),
        })),
    }
}

async fn try_markitdown(file_path: &str) -> Result<serde_json::Value, String> {
    let output = Command::new("markitdown")
        .arg(file_path)
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(serde_json::json!({
            "success": true,
            "result": String::from_utf8_lossy(&output.stdout).to_string(),
        }))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

async fn try_pandoc(file_path: &str) -> Result<serde_json::Value, String> {
    let output = Command::new("pandoc")
        .args([file_path, "-t", "markdown"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(serde_json::json!({
            "success": true,
            "result": String::from_utf8_lossy(&output.stdout).to_string(),
        }))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

// ====== 注册 ======

pub fn register(registry: &mut Registry) {
    registry.register("file.checkType", |req, tx| Box::pin(file_check_type(req, tx)));
    registry.register("file.convert", |req, tx| Box::pin(file_convert(req, tx)));
}
