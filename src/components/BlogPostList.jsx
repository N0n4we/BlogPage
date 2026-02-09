import { useBlogPosts } from '../hooks/useBlogPosts';
import BlogPost from './BlogPost';

export default function BlogPostList({ expandedPostId, onPostToggle }) {
  const { posts, loading, error } = useBlogPosts();

  if (loading) {
    return (
      <section className="blog-posts">
        <div className="container">
          <div style={{ padding: '2rem' }}>
            <p>正在加载博客文章...</p>
          </div>
        </div>
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
    <section className="blog-posts">
      <div className="container">
        {posts.map(post => (
          <BlogPost
            key={post.dateStr}
            post={post}
            isExpanded={expandedPostId === post.dateStr}
            onToggle={() => onPostToggle(post.dateStr)}
          />
        ))}
      </div>
    </section>
  );
}
