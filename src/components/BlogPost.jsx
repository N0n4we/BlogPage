import { useState, useRef, useEffect, useCallback } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import { parseMarkdownWithFootnotes, createSummaryFromMarkdown } from '../utils/markdown';

export default function BlogPost({ post, isExpanded, onToggle }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const fullContentRef = useRef(null);
  const postRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
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
    el.style.maxHeight = 'none';
    const target = el.scrollHeight;
    el.style.maxHeight = '0px';
    el.offsetHeight; // force reflow
    el.classList.add('expanded');
    el.style.maxHeight = target + 'px';

    const onEnd = (e) => {
      if (e.propertyName === 'max-height') {
        el.style.maxHeight = 'none';
        el.removeEventListener('transitionend', onEnd);
      }
    };
    el.addEventListener('transitionend', onEnd);
  }, []);

  const animateCollapse = useCallback(() => {
    const el = fullContentRef.current;
    if (!el) return;
    if (getComputedStyle(el).maxHeight === 'none') {
      el.style.maxHeight = el.scrollHeight + 'px';
      el.offsetHeight; // force reflow
    }
    el.style.maxHeight = '0px';
    requestAnimationFrame(() => {
      el.classList.remove('expanded');
    });
  }, []);

  useEffect(() => {
    if (isExpanded && !content) {
      setLoading(true);
      const url = `/blogs/${encodeURIComponent(post.file)}`;
      fetch(url, { cache: 'no-store' })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then(markdown => {
          const summary = createSummaryFromMarkdown(markdown);
          if (summary) {
            const metaTag = document.querySelector('meta[name="description"]');
            if (metaTag) metaTag.content = summary;
          }
          const htmlContent = parseMarkdownWithFootnotes(markdown);
          setContent(htmlContent);
        })
        .catch(err => {
          setContent(`<p style="color: var(--warning-color);">加载失败：${err.message}</p>`);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isExpanded, content, post.file]);

  useEffect(() => {
    if (isExpanded) {
      animateExpand();
    } else if (fullContentRef.current?.classList.contains('expanded')) {
      animateCollapse();
    }
  }, [isExpanded, animateExpand, animateCollapse]);

  useEffect(() => {
    if (content && fullContentRef.current) {
      Prism.highlightAllUnder(fullContentRef.current);
      if (getComputedStyle(fullContentRef.current).maxHeight !== 'none') {
        fullContentRef.current.style.maxHeight = fullContentRef.current.scrollHeight + 'px';
      }
    }
  }, [content]);

  const handleClick = (e) => {
    if (e.target.closest('.post-full-content')) return;
    onToggle();
  };

  useEffect(() => {
    if (postRef.current) {
      postRef.current.style.setProperty('--mouse-x', '50%');
      postRef.current.style.setProperty('--mouse-y', '50%');
    }
  }, []);

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
        <h3>{post.title}</h3>
        <p className="post-meta">{post.displayDate}</p>
        <div className="post-full-content" ref={fullContentRef}>
          <div
            className="rendered-content"
            dangerouslySetInnerHTML={{
              __html: loading ? '<p style="opacity:.8">正在加载...</p>' : content
            }}
          />
        </div>
      </div>
    </article>
  );
}
