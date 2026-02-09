import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import MusicPlayer from './components/MusicPlayer';
import BlogPostList from './components/BlogPostList';

const originalTitle = "Noname's Blog";
const originalMetaDescription = "Welcome to Noname's Blog. A collection of thoughts, ideas, and sighs.";

function BlogPage() {
  const { dateId } = useParams();
  const navigate = useNavigate();
  const [expandedPostId, setExpandedPostId] = useState(dateId || null);

  useEffect(() => {
    if (dateId && dateId !== expandedPostId) {
      setExpandedPostId(dateId);
    }
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
        if (metaTag) metaTag.content = originalMetaDescription;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handlePostToggle = useCallback((postDateStr) => {
    if (expandedPostId === postDateStr) {
      setExpandedPostId(null);
      navigate('/', { replace: false });
      document.title = originalTitle;
      const metaTag = document.querySelector('meta[name="description"]');
      if (metaTag) metaTag.content = originalMetaDescription;
    } else {
      setExpandedPostId(postDateStr);
      navigate(`/${postDateStr}`, { replace: false });
    }
  }, [expandedPostId, navigate]);

  useEffect(() => {
    const handleResize = () => {
      if (!expandedPostId) return;
      const post = document.querySelector(`.post[data-date="${expandedPostId}"]`);
      if (!post) return;
      const fullContentDiv = post.querySelector('.post-full-content');
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
