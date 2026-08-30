import { useCallback, useEffect, useRef } from 'react';

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

  useEffect(() => {
    const element = containerRef.current;
    return () => {
      const onEnd = onEndRef.current;
      if (element && onEnd) element.removeEventListener('transitionend', onEnd);
    };
  }, []);

  /** Re-measure maxHeight to fit current content — call on window resize. */
  const syncHeight = useCallback(() => {
    const el = containerRef.current;
    if (!el || !el.classList.contains('expanded')) return;
    if (getComputedStyle(el).maxHeight !== 'none') {
      el.style.maxHeight = `${el.scrollHeight}px`;
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

    if (el.classList.contains('expanded')) {
      syncHeight();
      return;
    }

    el.style.maxHeight = '0px';
    el.classList.add('expanded');
    const target = el.scrollHeight;
    // 强制回流，确保浏览器注册 0 → target 的 transition
    el.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions
    el.style.maxHeight = `${target}px`;

    const onEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'max-height') {
        el.style.maxHeight = 'none';
        el.removeEventListener('transitionend', onEnd);
        onEndRef.current = null;
      }
    };
    onEndRef.current = onEnd;
    el.addEventListener('transitionend', onEnd);
  }, [syncHeight]);

  const collapse = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // 移除之前展开动画的 transitionend 监听
    if (onEndRef.current) {
      el.removeEventListener('transitionend', onEndRef.current);
      onEndRef.current = null;
    }

    if (!el.classList.contains('expanded')) {
      el.style.maxHeight = '0px';
      return;
    }

    if (getComputedStyle(el).maxHeight === 'none') {
      el.style.maxHeight = `${el.scrollHeight}px`;
      el.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions
    }

    el.style.maxHeight = '0px';
    el.classList.remove('expanded');
  }, []);

  return { containerRef, expand, collapse, syncHeight };
}
