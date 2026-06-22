#![allow(deprecated)]
//! 本地模型推理——llama.cpp 流式文本生成
//! 使用 llama-cpp-2 v0.1 crate 直接调用 C API。

use crate::handlers::emit;
use crate::handlers::OutputLine;
use serde_json::Value;
use std::num::NonZeroU32;
use tokio::sync::mpsc;

fn get_backend() -> &'static llama_cpp_2::llama_backend::LlamaBackend {
    static BACKEND: std::sync::OnceLock<llama_cpp_2::llama_backend::LlamaBackend> = std::sync::OnceLock::new();
    BACKEND.get_or_init(|| llama_cpp_2::llama_backend::LlamaBackend::init().expect("llama init"))
}

pub async fn stream_inference(
    _model_id: &str,
    model_path_str: &str,
    messages: &[Value],
    max_tokens: u32,
    tx: mpsc::Sender<OutputLine>,
) -> Result<(), String> {
    use llama_cpp_2::context::params::LlamaContextParams;
    use llama_cpp_2::llama_batch::LlamaBatch;
    use llama_cpp_2::model::params::LlamaModelParams;
    use llama_cpp_2::model::{AddBos, LlamaModel, Special};
    use llama_cpp_2::token::data_array::LlamaTokenDataArray;

    let model_path = std::path::Path::new(model_path_str);
    if !model_path.exists() {
        return Err(format!("模型文件不存在: {}", model_path.display()));
    }

    let backend = get_backend();

    // 加载模型
    let model = LlamaModel::load_from_file(&backend, model_path, &LlamaModelParams::default())
        .map_err(|e| format!("加载模型失败: {e}"))?;

    // 创建上下文 (4096 window, 512 batch)
    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(4096))
        .with_n_batch(512);
    let mut ctx = model
        .new_context(&backend, ctx_params)
        .map_err(|e| format!("创建上下文失败: {e}"))?;

    // ChatML fallback prompt（大部分 GGUF 模型兼容）
    let mut prompt = String::from("<|im_start|>system\nYou are a helpful coding assistant.<|im_end|>\n");
    for m in messages {
        let role = m["role"].as_str().unwrap_or("user");
        let content = m["content"].as_str().unwrap_or("");
        prompt.push_str(&format!("<|im_start|>{role}\n{content}<|im_end|>\n"));
    }
    prompt.push_str("<|im_start|>assistant\n");

    // Tokenize
    let tokens = model.str_to_token(&prompt, AddBos::Always)
        .map_err(|e| format!("Tokenize: {e}"))?;

    // Batch
    let mut batch = LlamaBatch::new(512, 1);
    let n = tokens.len();
    for (i, t) in tokens.iter().enumerate() {
        batch.add(*t, i as i32, &[0], i == n - 1).map_err(|e| format!("batch: {e}"))?;
    }

    // Decode
    ctx.decode(&mut batch).map_err(|e| format!("decode: {e}"))?;

    let mut n_gen = 0u32;
    let max = max_tokens.min(2048);

    while n_gen < max {
        let candidates: Vec<_> = ctx.candidates().collect();
        if candidates.is_empty() { break; }
        let mut da = LlamaTokenDataArray::from_iter(candidates, false);
        let tok = da.sample_token_greedy();

        if tok == model.token_eos() { break; }

        let text = model.token_to_str(tok, Special::Tokenize).unwrap_or_default();
        emit(&tx, "model.chatChunk", serde_json::json!({"text": text}));
        n_gen += 1;

        batch.clear();
        batch.add(tok, n as i32, &[0], true).map_err(|e| format!("batch: {e}"))?;
        ctx.decode(&mut batch).map_err(|e| format!("decode: {e}"))?;
    }

    emit(&tx, "model.chatDone", serde_json::json!({}));
    Ok(())
}

pub fn unload_model() {}
