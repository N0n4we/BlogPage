import { useState, useRef, useEffect, useCallback, MouseEvent } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import { parseMarkdownWithFootnotes, createSummaryFromMarkdown } from '../utils/markdown';
import { devourContent } from '../utils/devour';
import { useGlitchEffect } from '../hooks/useGlitchEffect';
import { useContentTransition } from '../hooks/useContentTransition';
import { BlogPost as BlogPostType } from '../hooks/useBlogPosts';

interface BlogPostProps {
  post: BlogPostType;
  isExpanded: boolean;
  onToggle: () => void;
}

/** 首次折叠时替换原文的 mantra 短语 */
const DEVOUR_MANTRA = 'The past cannot define me.';

export default function BlogPost({ post, isExpanded, onToggle }: BlogPostProps) {
  // ---- 内容状态 ----
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [contentError, setContentError] = useState(false);
  const eatenRef = useRef(false);

  // ---- DOM refs ----
  const postRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { containerRef, expand, collapse } = useContentTransition();

  // ---- 鼠标涟漪 ----
  const handleMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
    if (!postRef.current) return;
    const rect = postRef.current.getBoundingClientRect();
    postRef.current.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    postRef.current.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
  }, []);

  // ---- 获取 Markdown 内容 ----
  useEffect(() => {
    if (!isExpanded || content) return;

    setContentError(false);
    setLoading(true);

    const url = `/blogs/${encodeURIComponent(post.file)}`;
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const markdown = await res.text();

        // 更新页面 meta description
        const summary = createSummaryFromMarkdown(markdown);
        if (summary) {
          const metaTag = document.querySelector('meta[name="description"]');
          if (metaTag) metaTag.setAttribute('content', summary);
        }

        const htmlContent = await parseMarkdownWithFootnotes(markdown);
        setContent(htmlContent);
      })
      .catch((err) => {
        setContent(`<p style="color: var(--warning-color);">加载失败：${err.message}</p>`);
        setContentError(true);
      })
      .finally(() => setLoading(false));
  }, [isExpanded, content, post.file]);

  // ---- 展开 / 折叠 + 吞噬 ----
  useEffect(() => {
    const isCurrentlyExpanded = containerRef.current?.classList.contains('expanded') ?? false;

    if (isExpanded) {
      // 还在加载或尚无内容 → 等内容就绪后再触发展开
      if (loading || (!content && !loading)) return;
      expand();
    } else if (isCurrentlyExpanded) {
      // 首次折叠：瞬间将原文替换为 mantra
      if (!eatenRef.current && content && !contentError) {
        const devouredHtml = devourContent(content, DEVOUR_MANTRA);

        // 同步更新 DOM 实现"立马"替换
        if (contentRef.current) {
          contentRef.current.innerHTML = devouredHtml;
        }
        setContent(devouredHtml);
        eatenRef.current = true;
      }
      collapse();
    }
  }, [isExpanded, loading, content, contentError, expand, collapse, containerRef]);

  // ---- 内容就绪后 Prism 高亮 + 调整高度 ----
  useEffect(() => {
    if (!content || !containerRef.current || !isExpanded) return;

    Prism.highlightAllUnder(containerRef.current);

    const rafId = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el || !isExpanded) return;

      if (!el.classList.contains('expanded')) {
        expand();
      } else if (getComputedStyle(el).maxHeight !== 'none') {
        el.style.maxHeight = el.scrollHeight + 'px';
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [content, isExpanded, expand, containerRef]);

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
    enabled: !!content && !contentError,
    intensity: 'light',
  });

  useGlitchEffect(contentRef, {
    enabled: !!content && !contentError,
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
              __html: loading ? '<p style="opacity:.8">正在加载...</p>' : content,
            }}
          />
        </div>
      </div>
    </article>
  );
}
