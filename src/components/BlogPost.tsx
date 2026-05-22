import { useState, useRef, useEffect, useCallback, MouseEvent } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import { devourContent } from '../utils/devour';
import { useGlitchEffect } from '../hooks/useGlitchEffect';
import { useContentTransition } from '../hooks/useContentTransition';
import { useContentPipeline } from '../hooks/useContentPipeline';
import { documentHead } from '../modules/documentHead';
import { BlogPost as BlogPostType } from '../hooks/useBlogPosts';

interface BlogPostProps {
  post: BlogPostType;
  isExpanded: boolean;
  onToggle: () => void;
}

/** 首次折叠时替换原文的 mantra 短语 */
const DEVOUR_MANTRA = 'The past cannot define me.';

export default function BlogPost({ post, isExpanded, onToggle }: BlogPostProps) {
  // Content pipeline: fetch + parse markdown (skipped when collapsed)
  const { html, summary, loading, error } = useContentPipeline(
    isExpanded ? post.file : null,
  );

  // DOM refs
  const postRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { containerRef, expand, collapse, syncHeight } = useContentTransition();
  const eatenRef = useRef(false);
  const [devouredHtml, setDevouredHtml] = useState('');

  // Display: show devoured HTML after first collapse, original otherwise
  const displayHtml = eatenRef.current ? devouredHtml : html;

  // Meta description from content summary (only when expanded)
  useEffect(() => {
    if (summary && isExpanded) documentHead.setMeta(summary);
  }, [summary, isExpanded]);

  // Resize: re-measure expanded content height
  useEffect(() => {
    if (!isExpanded) return;
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, [isExpanded, syncHeight]);

  // ---- 鼠标涟漪 ----
  const handleMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
    if (!postRef.current) return;
    const rect = postRef.current.getBoundingClientRect();
    postRef.current.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    postRef.current.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  }, []);

  // ---- 展开 / 折叠 + 吞噬 ----
  useEffect(() => {
    const isCurrentlyExpanded = containerRef.current?.classList.contains('expanded') ?? false;

    if (isExpanded) {
      // Still loading or no content yet → wait
      if (loading || (!html && !loading)) return;
      expand();
    } else if (isCurrentlyExpanded) {
      // First collapse: replace content with mantra
      if (!eatenRef.current && html && !error) {
        const dh = devourContent(html, DEVOUR_MANTRA);
        // Sync DOM immediately so the collapse transition shows the mantra
        if (contentRef.current) contentRef.current.innerHTML = dh;
        setDevouredHtml(dh);
        eatenRef.current = true;
      }
      collapse();
    }
  }, [isExpanded, loading, html, error, expand, collapse, containerRef]);

  // ---- 内容就绪后 Prism 高亮 + 调整高度 ----
  useEffect(() => {
    if (!html || !containerRef.current || !isExpanded) return;

    Prism.highlightAllUnder(containerRef.current);

    const rafId = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el || !isExpanded) return;

      if (!el.classList.contains('expanded')) {
        expand();
      } else {
        syncHeight();
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [html, isExpanded, expand, syncHeight, containerRef]);

  // ---- 点击切换 ----
  const handleClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('.post-full-content')) return;
    onToggle();
  };

  // ---- 初始化鼠标位置 ----
  useEffect(() => {
    if (postRef.current) {
      postRef.current.style.setProperty('--mouse-x', '50%');
      postRef.current.style.setProperty('--mouse-y', '50%');
    }
  }, []);

  // ---- Glitch 效果 ----
  useGlitchEffect(titleRef, {
    enabled: !!html && !error,
    intensity: 'light',
  });

  useGlitchEffect(contentRef, {
    enabled: !!html && !error,
    intensity: 'heavy',
  });

  // ---- 渲染 ----
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

        <div className="post-full-content" ref={containerRef}>
          <div
            className="rendered-content"
            ref={contentRef}
            dangerouslySetInnerHTML={{
              __html: loading ? '<p style="opacity:.8">正在加载...</p>' : displayHtml,
            }}
          />
        </div>
      </div>
    </article>
  );
}
