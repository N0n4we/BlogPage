import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { devourContent } from '../utils/devour';
import { useGlitchEffect } from '../hooks/useGlitchEffect';
import { useContentTransition } from '../hooks/useContentTransition';
import { useContentPipeline } from '../hooks/useContentPipeline';
import { documentHead } from '../modules/documentHead';
import type { BlogPost as BlogPostType } from '../types/blog';

interface BlogPostProps {
  post: BlogPostType;
  isExpanded: boolean;
  onToggle: () => void;
}

/** 首次折叠时替换原文的 mantra 短语 */
const DEVOUR_MANTRA = 'The past cannot define me.';

/** 3D tilt max angle in degrees */
const TILT_MAX_ANGLE = 8;

/** Touch device detection — computed once at module load */
const isTouchDevice =
  typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export default function BlogPost({ post, isExpanded, onToggle }: BlogPostProps) {
  // Content pipeline: fetch + parse markdown (skipped when collapsed)
  const { html, summary, loading, error } = useContentPipeline(
    isExpanded ? post.file : null,
  );

  // DOM refs
  const postRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const metaRef = useRef<HTMLParagraphElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { containerRef, expand, collapse, syncHeight } = useContentTransition();
  const [devouredHtml, setDevouredHtml] = useState('');

  // Display: show devoured HTML after first collapse, original otherwise
  const displayHtml = devouredHtml || html;

  // Meta description from content summary (only when expanded)
  useEffect(() => {
    if (!isExpanded) return;
    documentHead.setTitle(post.title);
    if (summary) documentHead.setMeta(summary);
  }, [post.title, summary, isExpanded]);

  // Resize: re-measure expanded content height
  useEffect(() => {
    if (!isExpanded) return;
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, [isExpanded, syncHeight]);

  // ---- 鼠标涟漪 + 3D tilt ----
  const handleMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
    if (!postRef.current) return;
    const rect = postRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    postRef.current.style.setProperty('--mouse-x', `${mouseX}px`);
    postRef.current.style.setProperty('--mouse-y', `${mouseY}px`);

    // 3D tilt (disabled on touch devices)
    if (!isTouchDevice) {
      const tiltX = ((mouseY / rect.height) - 0.5) * -TILT_MAX_ANGLE;
      const tiltY = ((mouseX / rect.width) - 0.5) * TILT_MAX_ANGLE;
      postRef.current.style.setProperty('--tilt-x', `${tiltX}deg`);
      postRef.current.style.setProperty('--tilt-y', `${tiltY}deg`);
    }
  }, []);

  // ---- 展开 / 折叠 + 吞噬 ----
  useEffect(() => {
    let cancelled = false;
    const isCurrentlyExpanded = containerRef.current?.classList.contains('expanded') ?? false;

    if (isExpanded) {
      // Still loading or no content yet → wait
      if (loading || (!html && !loading)) return;
      expand();
    } else if (isCurrentlyExpanded) {
      // First collapse: replace content with mantra
      if (!devouredHtml && html && !error) {
        const dh = devourContent(html, DEVOUR_MANTRA);
        // Sync DOM immediately so the collapse transition shows the mantra
        if (contentRef.current) contentRef.current.innerHTML = dh;
        queueMicrotask(() => {
          if (!cancelled) setDevouredHtml(dh);
        });
      }
      collapse();
    }

    return () => { cancelled = true; };
  }, [isExpanded, loading, html, error, devouredHtml, expand, collapse, containerRef]);

  // ---- 内容就绪后 Prism 高亮 + 调整高度 ----
  useEffect(() => {
    if (!html || !containerRef.current || !isExpanded) return;

    let cancelled = false;
    let rafId = 0;

    void import('../utils/highlight').then(({ highlightContent }) => {
      if (cancelled || !containerRef.current || !isExpanded) return;

      highlightContent(containerRef.current);
      rafId = requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el || cancelled || !isExpanded) return;

        syncHeight();
      });
    });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [html, isExpanded, syncHeight, containerRef]);

  // ---- 点击切换 ----
  const handleClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('.post-full-content')) return;
    onToggle();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('.post-full-content')) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onToggle();
  };

  // ---- 初始化鼠标位置 & tilt ----
  useEffect(() => {
    if (postRef.current) {
      postRef.current.style.setProperty('--mouse-x', '50%');
      postRef.current.style.setProperty('--mouse-y', '50%');
      postRef.current.style.setProperty('--tilt-x', '0deg');
      postRef.current.style.setProperty('--tilt-y', '0deg');
    }
  }, []);

  // ---- Glitch 效果 ----
  useGlitchEffect(titleRef, {
    enabled: post.hasGlitchEffect,
    intensity: 'light',
    profile: 'title',
  });

  useGlitchEffect(metaRef, {
    enabled: post.hasGlitchEffect,
    intensity: 'light',
    profile: 'meta',
  });

  useGlitchEffect(contentRef, {
    enabled: post.hasGlitchEffect && !!html && !error,
    paused: !isExpanded,
    intensity: 'heavy',
    profile: 'body',
  });

  // ---- 渲染 ----
  return (
    <article
      ref={postRef}
      className="post"
      data-file={post.file}
      data-date={post.dateStr}
      data-title={post.title}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-controls={`post-content-${post.dateStr}`}
      aria-busy={loading}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="post-content-wrapper">
        <h3 ref={titleRef}>{post.title}</h3>
        <p className="post-meta" ref={metaRef}>{post.displayDate}</p>

        <div
          className="post-full-content"
          id={`post-content-${post.dateStr}`}
          ref={containerRef}
          aria-hidden={!isExpanded}
        >
          <div
            className="rendered-content"
            ref={contentRef}
            dangerouslySetInnerHTML={{
              __html: loading ? '<p class="content-loading">正在加载...</p>' : displayHtml,
            }}
          />
        </div>
      </div>
    </article>
  );
}
