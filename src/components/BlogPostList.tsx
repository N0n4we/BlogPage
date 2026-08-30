import { useBlogPosts } from '../hooks/useBlogPosts';
import BlogPostComponent from './BlogPost';

interface BlogPostListProps {
  expandedPostId: string | null;
  onPostToggle: (postDateStr: string) => void;
}

const MAX_STAGGERED_ENTRIES = 8;
const ENTRY_STAGGER_MS = 35;

export default function BlogPostList({ expandedPostId, onPostToggle }: BlogPostListProps) {
  const { posts, loading, error } = useBlogPosts();
  const hasPosts = posts.length > 0;

  return (
    <section
      className={`blog-posts${hasPosts ? ' blog-posts--ready' : ''}`}
      aria-busy={loading}
    >
      <div className="container">
        {loading && (
          <p className="blog-posts-status" role="status">
            正在加载文章列表…
          </p>
        )}

        {!loading && error && (
          <p className="blog-posts-status blog-posts-status--error" role="alert">
            加载失败：{error}
          </p>
        )}

        {!loading && !error && !hasPosts && (
          <div className="blog-posts-empty">
            <h3>暂无博客文章</h3>
            <p>在 ./blogs/ 目录下添加 .md 文件来创建博客文章。</p>
            <p>文件名格式推荐: <code>YYYYMMDD-your-title.md</code></p>
          </div>
        )}

        {!loading && !error && posts.map((post, index) => (
          <div
            className="post-list-entry"
            key={post.file}
            style={{
              animationDelay: `${Math.min(index, MAX_STAGGERED_ENTRIES) * ENTRY_STAGGER_MS}ms`,
            }}
          >
            <BlogPostComponent
              post={post}
              isExpanded={expandedPostId === post.dateStr}
              onToggle={() => onPostToggle(post.dateStr)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
