import { marked, Token, Tokens, TokenizerExtension, RendererExtension } from 'marked';
import init, { parse_markdown } from '../wasm/wasm_markdown';

// WASM初始化状态
let wasmReady: Promise<void> | null = null;
let useWasm = true;

// 预加载WASM
wasmReady = init().then(() => {}).catch(() => { useWasm = false; });

interface FootnoteToken extends Tokens.Generic {
  type: 'footnote';
  raw: string;
  id: string;
  text: string;
}

interface FootnoteRefToken extends Tokens.Generic {
  type: 'footnoteRef';
  raw: string;
  id: string;
}

// 为 Marked.js 添加脚注扩展
const footnoteExtension: TokenizerExtension & RendererExtension = {
  name: 'footnote',
  level: 'block',
  start(src: string) {
    const match = src.match(/^\[\^[^\]]+\]:/);
    return match ? match.index : undefined;
  },
  tokenizer(src: string): FootnoteToken | undefined {
    const rule = /^\[\^([^\]]+)\]:\s*(.*)$/;
    const match = rule.exec(src);
    if (match) {
      return {
        type: 'footnote',
        raw: match[0],
        id: match[1],
        text: match[2],
      };
    }
  },
  renderer() {
    return '';
  }
};

const footnoteRefExtension: TokenizerExtension & RendererExtension = {
  name: 'footnoteRef',
  level: 'inline',
  start(src: string) {
    const match = src.match(/\[\^[^\]]+\]/);
    return match ? match.index : undefined;
  },
  tokenizer(src: string): FootnoteRefToken | undefined {
    const rule = /^\[\^([^\]]+)\]/;
    const match = rule.exec(src);
    if (match) {
      return {
        type: 'footnoteRef',
        raw: match[0],
        id: match[1],
      };
    }
  },
  renderer(token: Token) {
    const footnoteToken = token as FootnoteRefToken;
    return `<sup class="footnote-ref"><span class="footnote-element">${footnoteToken.id}</span></sup>`;
  },
};

// 配置 marked
marked.use({
  extensions: [footnoteExtension, footnoteRefExtension]
});

marked.setOptions({
  gfm: true,
  breaks: true
});

// 解析 Markdown 并处理脚注
export async function parseMarkdownWithFootnotes(markdown: string): Promise<string> {
  // 尝试使用WASM解析器
  if (useWasm) {
    try {
      await wasmReady;
      return parse_markdown(markdown);
    } catch (e) {
      console.warn('WASM parser failed, falling back to marked:', e);
      useWasm = false;
    }
  }

  // Fallback到marked
  const footnoteDefinitions: Record<string, string> = {};
  const footnoteRegex = /^\[\^([^\]]+)\]:\s*(.*)$/gm;
  let match;

  while ((match = footnoteRegex.exec(markdown)) !== null) {
    footnoteDefinitions[match[1]] = match[2].trim();
  }

  const parseOptions = { gfm: true, breaks: true };
  const html = marked.parse(markdown, parseOptions) as string;
  const footnotes = footnoteDefinitions;

  if (footnotes && Object.keys(footnotes).length > 0) {
    let footnotesHtml = '\n\n<div class="footnotes">\n<hr>\n<ol class="footnotes-list">\n';
    for (const id in footnotes) {
      footnotesHtml += `<li id="footnote-${id}" class="footnote-item">`;
      footnotesHtml += marked.parseInline(footnotes[id], parseOptions);
      footnotesHtml += ` <span class="footnote-backref footnote-element">↩</span>`;
      footnotesHtml += `</li>\n`;
    }
    footnotesHtml += '</ol>\n</div>';
    return html + footnotesHtml;
  }

  return html;
}

// 从 Markdown 创建摘要
export function createSummaryFromMarkdown(markdown: string, maxLength: number = 155): string {
  if (!markdown) return '';
  let text = markdown
    .replace(/^#+\s*.*/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[`*~_>#|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > maxLength) {
    text = text.substring(0, maxLength - 3) + '...';
  }
  return text;
}

// 将文件名 slug 转换为可读的标题
export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
