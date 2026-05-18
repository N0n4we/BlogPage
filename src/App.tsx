import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import MusicPlayer from './components/MusicPlayer';
import BlogPostList from './components/BlogPostList';

const POST_EXPANDED_KEY = 'n0n4w3_post_expanded';
const POST_EXPANDED_EVENT = 'n0n4w3-post-expanded';

/** 首次展开 post 时标记并通知 Header 开始 glitch */
function markFirstPostExpanded() {
  if (localStorage.getItem(POST_EXPANDED_KEY)) return;
  localStorage.setItem(POST_EXPANDED_KEY, '1');
  window.dispatchEvent(new CustomEvent(POST_EXPANDED_EVENT));
}

const originalTitle = "Noname's Blog";
const originalMetaDescription = "Welcome to Noname's Blog. A collection of thoughts, ideas, and sighs.";

function BlogPage() {
  const { dateId } = useParams<{ dateId?: string }>();
  const navigate = useNavigate();
  const [expandedPostId, setExpandedPostId] = useState<string | null>(dateId || null);

  useEffect(() => {
    if (dateId && dateId !== expandedPostId) {
      setExpandedPostId(dateId);
      markFirstPostExpanded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateId]);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const match = path.match(/^\/(\d{8})$/);
      if (match) {
        setExpandedPostId(match[1]);
      } else {
        setExpandedPostId(null);
        document.title = originalTitle;
        const metaTag = document.querySelector('meta[name="description"]');
        if (metaTag) metaTag.setAttribute('content', originalMetaDescription);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handlePostToggle = useCallback((postDateStr: string) => {
    if (expandedPostId === postDateStr) {
      setExpandedPostId(null);
      navigate('/', { replace: false });
      document.title = originalTitle;
      const metaTag = document.querySelector('meta[name="description"]');
      if (metaTag) metaTag.setAttribute('content', originalMetaDescription);
    } else {
      setExpandedPostId(postDateStr);
      markFirstPostExpanded();
      navigate(`/${postDateStr}`, { replace: false });
    }
  }, [expandedPostId, navigate]);

  useEffect(() => {
    const handleResize = () => {
      if (!expandedPostId) return;
      const post = document.querySelector(`.post[data-date="${expandedPostId}"]`);
      if (!post) return;
      const fullContentDiv = post.querySelector('.post-full-content') as HTMLElement | null;
      if (!fullContentDiv) return;
      if (getComputedStyle(fullContentDiv).maxHeight !== 'none') {
        fullContentDiv.style.maxHeight = fullContentDiv.scrollHeight + 'px';
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [expandedPostId]);

  return (
    <>
      <Header />
      <main className="main">
        <MusicPlayer />
        <BlogPostList
          expandedPostId={expandedPostId}
          onPostToggle={handlePostToggle}
        />
      </main>
      <Footer />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BlogPage />} />
        <Route path="/:dateId" element={<BlogPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
