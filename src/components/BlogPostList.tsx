import { forwardRef } from 'react';
import { useBlogPosts } from '../hooks/useBlogPosts';
import BlogPostComponent from './BlogPost';

interface BlogPostListProps {
  expandedPostId: string | null;
  onPostToggle: (postDateStr: string) => void;
  revealProgress: number;
}

const BlogPostList = forwardRef<HTMLElement, BlogPostListProps>(
  function BlogPostList({ expandedPostId, onPostToggle, revealProgress }, ref) {
  const { posts, loading, error } = useBlogPosts();

  if (loading) {
    return (
      <section className="blog-posts" style={{ visibility: 'hidden' }}>
        <div className="container" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="blog-posts">
        <div className="container">
          <div style={{ padding: '2rem' }}>
            <p style={{ color: 'var(--warning-color)' }}>加载失败：{error}</p>
          </div>
        </div>
      </section>
    );
  }

  if (posts.length === 0) {
    return (
      <section className="blog-posts">
        <div className="container">
          <div style={{ padding: '2rem' }}>
            <h3>暂无博客文章</h3>
            <p>在 ./blogs/ 目录下添加 .md 文件来创建博客文章。</p>
            <p>文件名格式推荐: <code>YYYYMMDD-your-title.md</code></p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className="blog-posts"
      style={{ opacity: revealProgress, transition: 'opacity 0.3s ease-out' }}
    >
      <div className="container">
        {posts.map(post => (
          <BlogPostComponent
            key={post.dateStr}
            post={post}
            isExpanded={expandedPostId === post.dateStr}
            isRevealed={revealProgress >= 1}
            onToggle={() => onPostToggle(post.dateStr)}
          />
        ))}
      </div>
    </section>
  );
});

export default BlogPostList;