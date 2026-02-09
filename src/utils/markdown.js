import { marked } from 'marked';

// 为 Marked.js 添加脚注扩展
const footnoteExtension = {
  name: 'footnote',
  level: 'block',
  start(src) {
    const match = src.match(/^\[\^[^\]]+\]:/);
    return match ? match.index : undefined;
  },
  tokenizer(src) {
    const rule = /^\[\^([^\]]+)\]:\s*(.*)$/;
    const match = rule.exec(src);
    if (match) {
      if (!this.lexer.options.footnotes) {
        this.lexer.options.footnotes = {};
      }
      this.lexer.options.footnotes[match[1]] = match[2].trim();
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

const footnoteRefExtension = {
  name: 'footnoteRef',
  level: 'inline',
  start(src) {
    const match = src.match(/\[\^[^\]]+\]/);
    return match ? match.index : undefined;
  },
  tokenizer(src) {
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
  renderer(token) {
    return `<sup class="footnote-ref"><span class="footnote-element">${token.id}</span></sup>`;
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
export function parseMarkdownWithFootnotes(markdown) {
  const footnoteDefinitions = {};
  const footnoteRegex = /^\[\^([^\]]+)\]:\s*(.*)$/gm;
  let match;

  while ((match = footnoteRegex.exec(markdown)) !== null) {
    footnoteDefinitions[match[1]] = match[2].trim();
  }

  const parseOptions = { gfm: true, breaks: true };
  const html = marked.parse(markdown, parseOptions);
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
export function createSummaryFromMarkdown(markdown, maxLength = 155) {
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
export function slugToTitle(slug) {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
