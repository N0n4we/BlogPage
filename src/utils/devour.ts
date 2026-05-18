/**
 * "吞噬"一段 HTML：保留所有标签结构，仅将文本内容替换为 mantra
 * 的循环拼接，长度与原文完全一致。
 *
 * 示例：
 *   <p>Hello World</p> → <p>The past cannot</p>
 *   (总长度 11，mantra 从 "The past cannot define me." 中取前 11 个字符)
 *
 * @param html   原始 HTML 字符串
 * @param mantra 用于替换的短语，默认 "The past cannot define me."
 * @returns       结构不变、文本被 mantra 替换后的 HTML
 */
export function devourContent(
  html: string,
  mantra: string = 'The past cannot define me.',
): string {
  const container = document.createElement('div');
  container.innerHTML = html;

  const totalLength = (container.textContent || '').length;
  if (totalLength === 0) return html;

  // 构建一条与原文总长度一致的 mantra 长字符串
  let fullMantra = '';
  while (fullMantra.length < totalLength) {
    fullMantra += mantra;
  }
  fullMantra = fullMantra.slice(0, totalLength);

  // 遍历所有文本节点，按文档顺序替换为 mantra 片段
  let offset = 0;
  replaceTextNodes(container, (len) => {
    const piece = fullMantra.slice(offset, offset + len);
    offset += len;
    return piece;
  });

  return container.innerHTML;
}

/**
 * 深度优先遍历 DOM 树，对每个文本节点调用 fn 获取替换文本。
 * fn 接收文本节点当前文本的长度，返回等长的替换字符串。
 */
function replaceTextNodes(
  node: Node,
  fn: (length: number) => string,
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    const len = text.length;
    if (len > 0) {
      // 纯空白文本节点（标签间的换行/缩进）：消费 mantra 偏移量但不替换内容，
      // 否则 mantra 字符会混入不可见区域产生多余的"换行"
      if (text.trim().length === 0) {
        fn(len); // 仅推进 offset，丢弃结果
      } else {
        node.textContent = fn(len);
      }
    }
  } else {
    // 使用 childNodes 而非 children，因为我们需要遍历所有节点类型
    // （包括注释节点等），但只对文本节点做替换
    const children = Array.from(node.childNodes);
    for (const child of children) {
      replaceTextNodes(child, fn);
    }
  }
}
