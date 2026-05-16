import { useState, useRef, useEffect, useCallback, MouseEvent } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import { parseMarkdownWithFootnotes, createSummaryFromMarkdown } from '../utils/markdown';
import { useGlitchEffect } from '../hooks/useGlitchEffect';
import { BlogPost as BlogPostType } from '../hooks/useBlogPosts';

interface BlogPostProps {
  post: BlogPostType;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function BlogPost({ post, isExpanded, onToggle }: BlogPostProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [contentError, setContentError] = useState(false);
  const fullContentRef = useRef<HTMLDivElement>(null);
  const postRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const onEndRef = useRef<((e: TransitionEvent) => void) | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
    if (!postRef.current) return;
    const rect = postRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    postRef.current.style.setProperty('--mouse-x', `${x}px`);
    postRef.current.style.setProperty('--mouse-y', `${y}px`);
  }, []);

  const animateExpand = useCallback(() => {
    const el = fullContentRef.current;
    if (!el) return;
    // Remove any prior transitionend listener so it doesn't fire on a later collapse.
    if (onEndRef.current) {
      el.removeEventListener('transitionend', onEndRef.current);
      onEndRef.current = null;
    }
    el.style.maxHeight = 'none';
    const target = el.scrollHeight;
    el.style.maxHeight = '0px';
    el.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions -- force reflow
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

  const animateCollapse = useCallback(() => {
    const el = fullContentRef.current;
    if (!el) return;
    // Remove any prior expand-transitionend listener — otherwise it would fire
    // when the collapse's max-height transition reaches 0 and snap maxHeight
    // back to 'none' (visible "snap to original" glitch).
    if (onEndRef.current) {
      el.removeEventListener('transitionend', onEndRef.current);
      onEndRef.current = null;
    }
    if (getComputedStyle(el).maxHeight === 'none') {
      el.style.maxHeight = el.scrollHeight + 'px';
      el.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions -- force reflow
    }
    el.style.maxHeight = '0px';
    el.classList.remove('expanded');
  }, []);

  useEffect(() => {
    if (isExpanded && !content) {
      setContentError(false);
      setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- intentional fetch trigger
      const url = `/blogs/${encodeURIComponent(post.file)}`;
      fetch(url, { cache: 'no-store' })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then(async markdown => {
          const summary = createSummaryFromMarkdown(markdown);
          if (summary) {
            const metaTag = document.querySelector('meta[name="description"]');
            if (metaTag) metaTag.setAttribute('content', summary);
          }
          const htmlContent = await parseMarkdownWithFootnotes(markdown);
          setContent(htmlContent);
        })
        .catch(err => {
          setContent(`<p style="color: var(--warning-color);">加载失败：${err.message}</p>`);
          setContentError(true);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isExpanded, content, post.file]);

  // 展开动画：等待内容加载完成后再触发
  useEffect(() => {
    if (isExpanded) {
      // 如果内容还在加载，不触发动画（等待内容加载完成后由下面的 effect 触发）
      if (loading || (!content && !loading)) return;
      animateExpand();
    } else if (fullContentRef.current?.classList.contains('expanded')) {
      animateCollapse();
    }
  }, [isExpanded, loading, content, animateExpand, animateCollapse]);

  // 内容加载完成后：先执行 Prism 高亮，再触发展开动画
  useEffect(() => {
    if (content && fullContentRef.current && isExpanded) {
      Prism.highlightAllUnder(fullContentRef.current);
      // 使用 requestAnimationFrame 确保 DOM 已更新后再计算高度
      const rafId = requestAnimationFrame(() => {
        const el = fullContentRef.current;
        if (!el) return;
        if (!isExpanded) return;
        if (!el.classList.contains('expanded')) {
          animateExpand();
        } else if (getComputedStyle(el).maxHeight !== 'none') {
          el.style.maxHeight = el.scrollHeight + 'px';
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
  }, [content, isExpanded, animateExpand]);

  const handleClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('.post-full-content')) return;
    onToggle();
  };

  useEffect(() => {
    if (postRef.current) {
      postRef.current.style.setProperty('--mouse-x', '50%');
      postRef.current.style.setProperty('--mouse-y', '50%');
    }
  }, []);

  // Glitch effect: heavy on body, light on title.
  // Enabled once content is loaded — runs continuously through expand/collapse
  // transitions so glitches never visibly "restart" when the user toggles a post.
  useGlitchEffect(titleRef, {
    enabled: !!content && !contentError,
    intensity: 'light',
  });

  useGlitchEffect(contentRef, {
    enabled: !!content && !contentError,
    intensity: 'heavy',
  });

  return (
    <article
      ref={postRef}
      className="post"
      data-file={post.file}
      data-date={post.dateStr}
      data-title={post.title}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
    >
      <div className="post-content-wrapper">
        <h3 ref={titleRef}>{post.title}</h3>
        <p className="post-meta">{post.displayDate}</p>
        <div className="post-full-content" ref={fullContentRef}>
          <div
            className="rendered-content"
            ref={contentRef}
            dangerouslySetInnerHTML={{
              __html: loading ? '<p style="opacity:.8">正在加载...</p>' : content
            }}
          />

        </div>
      </div>
    </article>
  );
}
