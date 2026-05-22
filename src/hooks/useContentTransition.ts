import { useRef, useCallback } from 'react';

/**
 * 管理博文正文区域的展开/折叠动画。
 *
 * 用法：
 *   const { expand, collapse, syncHeight, containerRef } = useContentTransition();
 *   // 将 containerRef 挂到 .post-full-content 上
 *   // 在 isExpanded 变化时调用 expand() / collapse()
 *   // syncHeight 用于 window resize 时重新测量 maxHeight
 */
export function useContentTransition() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onEndRef = useRef<((e: TransitionEvent) => void) | null>(null);

  /** Re-measure maxHeight to fit current content — call on window resize. */
  const syncHeight = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (getComputedStyle(el).maxHeight !== 'none') {
      el.style.maxHeight = el.scrollHeight + 'px';
    }
  }, []);

  const expand = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // 移除之前的 transitionend 监听，避免在后续折叠时误触发
    if (onEndRef.current) {
      el.removeEventListener('transitionend', onEndRef.current);
      onEndRef.current = null;
    }

    el.style.maxHeight = 'none';
    const target = el.scrollHeight;
    el.style.maxHeight = '0px';
    // 强制回流，确保浏览器注册 0 → target 的 transition
    el.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions
    el.classList.add('expanded');
    el.style.maxHeight = target + 'px';

    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'max-height') {
        el.style.maxHeight = 'none';
        el.removeEventListener('transitionend', onEnd);
        onEndRef.current = null;
      }
    };
    onEndRef.current = onEnd;
    el.addEventListener('transitionend', onEnd);
  }, []);

  const collapse = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // 移除之前展开动画的 transitionend 监听
    if (onEndRef.current) {
      el.removeEventListener('transitionend', onEndRef.current);
      onEndRef.current = null;
    }

    if (getComputedStyle(el).maxHeight === 'none') {
      el.style.maxHeight = el.scrollHeight + 'px';
      el.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions
    }

    el.style.maxHeight = '0px';
    el.classList.remove('expanded');
  }, []);

  return { containerRef, expand, collapse, syncHeight };
}
