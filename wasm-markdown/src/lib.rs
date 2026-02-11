use pulldown_cmark::{html, Event, Options, Parser, Tag, TagEnd};
use regex::Regex;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// 解析Markdown并处理脚注，返回HTML
#[wasm_bindgen]
pub fn parse_markdown(markdown: &str) -> String {
    // 提取脚注定义
    let footnote_regex = Regex::new(r"(?m)^\[\^([^\]]+)\]:\s*(.*)$").unwrap();
    let mut footnotes: HashMap<String, String> = HashMap::new();

    for cap in footnote_regex.captures_iter(markdown) {
        footnotes.insert(cap[1].to_string(), cap[2].trim().to_string());
    }

    // 移除脚注定义行
    let cleaned = footnote_regex.replace_all(markdown, "").to_string();

    // 配置pulldown-cmark选项 (GFM)
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS;

    let parser = Parser::new_ext(&cleaned, options);

    // 处理脚注引用并转换换行
    let parser = parser.flat_map(|event| {
        match event {
            Event::Text(text) => {
                process_text_with_footnotes(&text, &footnotes)
            }
            Event::SoftBreak => vec![Event::HardBreak],
            _ => vec![event],
        }
    });

    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);

    // 添加脚注列表
    if !footnotes.is_empty() {
        html_output.push_str("\n\n<div class=\"footnotes\">\n<hr>\n<ol class=\"footnotes-list\">\n");
        for (id, text) in &footnotes {
            let inline_html = parse_inline(&text);
            html_output.push_str(&format!(
                "<li id=\"footnote-{}\" class=\"footnote-item\">{} <span class=\"footnote-backref footnote-element\">↩</span></li>\n",
                id, inline_html
            ));
        }
        html_output.push_str("</ol>\n</div>");
    }

    html_output
}

/// 处理文本中的脚注引用
fn process_text_with_footnotes<'a>(text: &str, footnotes: &HashMap<String, String>) -> Vec<Event<'a>> {
    let footnote_ref_regex = Regex::new(r"\[\^([^\]]+)\]").unwrap();

    if !footnote_ref_regex.is_match(text) {
        return vec![Event::Text(text.to_string().into())];
    }

    let mut result = Vec::new();
    let mut last_end = 0;

    for cap in footnote_ref_regex.captures_iter(text) {
        let m = cap.get(0).unwrap();
        let id = &cap[1];

        // 添加脚注引用前的文本
        if m.start() > last_end {
            result.push(Event::Text(text[last_end..m.start()].to_string().into()));
        }

        // 只有当脚注定义存在时才渲染为脚注
        if footnotes.contains_key(id) {
            result.push(Event::Html(
                format!("<sup class=\"footnote-ref\"><span class=\"footnote-element\">{}</span></sup>", id).into()
            ));
        } else {
            result.push(Event::Text(m.as_str().to_string().into()));
        }

        last_end = m.end();
    }

    // 添加剩余文本
    if last_end < text.len() {
        result.push(Event::Text(text[last_end..].to_string().into()));
    }

    result
}

/// 解析内联Markdown
fn parse_inline(text: &str) -> String {
    let options = Options::ENABLE_STRIKETHROUGH;
    let parser = Parser::new_ext(text, options);

    // 移除外层<p>标签
    let mut html = String::new();
    html::push_html(&mut html, parser);

    html.trim()
        .strip_prefix("<p>")
        .and_then(|s| s.strip_suffix("</p>"))
        .unwrap_or(&html)
        .to_string()
}

/// 从Markdown创建摘要
#[wasm_bindgen]
pub fn create_summary(markdown: &str, max_length: usize) -> String {
    let text = markdown
        .lines()
        .filter(|line| !line.starts_with('#'))
        .collect::<Vec<_>>()
        .join(" ");

    let re_image = Regex::new(r"!\[.*?\]\(.*?\)").unwrap();
    let re_link = Regex::new(r"\[(.*?)\]\(.*?\)").unwrap();
    let re_special = Regex::new(r"[`*~_>#|\-]").unwrap();
    let re_whitespace = Regex::new(r"\s+").unwrap();

    let text = re_image.replace_all(&text, "");
    let text = re_link.replace_all(&text, "$1");
    let text = re_special.replace_all(&text, "");
    let text = re_whitespace.replace_all(&text, " ");
    let text = text.trim();

    if text.len() > max_length {
        format!("{}...", &text[..max_length.saturating_sub(3)])
    } else {
        text.to_string()
    }
}
