import { useState, useRef, useEffect, useCallback, MouseEvent } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import { parseMarkdownWithFootnotes, createSummaryFromMarkdown } from '../utils/markdown';
import Comments from './Comments';
import { BlogPost as BlogPostType } from '../hooks/useBlogPosts';

interface BlogPostProps {
  post: BlogPostType;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function BlogPost({ post, isExpanded, onToggle }: BlogPostProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const fullContentRef = useRef<HTMLDivElement>(null);
  const postRef = useRef<HTMLElement>(null);

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
      }
    };
    el.addEventListener('transitionend', onEnd);
  }, []);

  const animateCollapse = useCallback(() => {
    const el = fullContentRef.current;
    if (!el) return;
    if (getComputedStyle(el).maxHeight === 'none') {
      el.style.maxHeight = el.scrollHeight + 'px';
      el.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions -- force reflow
    }
    el.style.maxHeight = '0px';
    el.classList.remove('expanded');
  }, []);

  useEffect(() => {
    if (isExpanded && !content) {
      setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect -- intentional fetch trigger
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
            if (metaTag) metaTag.setAttribute('content', summary);
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
      requestAnimationFrame(() => {
        if (fullContentRef.current && !fullContentRef.current.classList.contains('expanded')) {
          animateExpand();
        } else if (fullContentRef.current && getComputedStyle(fullContentRef.current).maxHeight !== 'none') {
          // 如果已经展开但高度不对（比如 Prism 改变了高度），更新高度
          fullContentRef.current.style.maxHeight = fullContentRef.current.scrollHeight + 'px';
        }
      });
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
          {content && !loading && (
            <div className={`comments-wrapper ${isExpanded ? 'visible' : ''}`}>
              <Comments postId={post.dateStr} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
