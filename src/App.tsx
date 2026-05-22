import { useEffect, useState, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';

import Footer from './components/Footer';
import MusicPlayer from './components/MusicPlayer';
import BlogPostList from './components/BlogPostList';

import { usePostNavigation } from './hooks/usePostNavigation';

function BlogPage() {
  const { expandedPostId, togglePost, hasEverExpanded } = usePostNavigation();
  const mainRef = useRef<HTMLElement>(null);
  const blogRef = useRef<HTMLElement>(null);
  const [revealProgress, setRevealProgress] = useState(0);
  const [travelDist, setTravelDist] = useState(0);
  const travelDistRef = useRef(0);
  const rafRef = useRef(0);
  const lockedRef = useRef(false);

  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (lockedRef.current) return;

      // Re-measure on each scroll (handles section resize after posts load)
      const blog = blogRef.current;
      if (!blog) return;
      const blogTop = blog.getBoundingClientRect().top + window.scrollY;
      const dist = Math.max(0, blogTop - 60);
      if (dist !== travelDistRef.current) {
        travelDistRef.current = dist;
        setTravelDist(dist);
      }
      if (dist <= 160) {
        setRevealProgress(1);
        lockedRef.current = true;
        return;
      }

      const progress = Math.min(1, window.scrollY / dist);
      setRevealProgress(progress);
      if (progress >= 1) {
        lockedRef.current = true;
        window.removeEventListener('scroll', onScroll);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Fallback: show posts after 3s if still hidden
    const fallback = setTimeout(() => {
      if (lockedRef.current || cancelled) return;
      setRevealProgress(1);
      lockedRef.current = true;
    }, 3000);

    const id = requestAnimationFrame(() => {
      if (cancelled) return;
      clearTimeout(fallback);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      clearTimeout(fallback);
      window.removeEventListener('scroll', onScroll);
    };
  }, [onScroll]);

  return (
    <>
      <Header hasEverExpanded={hasEverExpanded} />
      <main className="main" ref={mainRef}>
        <MusicPlayer travelDist={travelDist} />
        <BlogPostList
          ref={blogRef}
          expandedPostId={expandedPostId}
          onPostToggle={togglePost}
          revealProgress={revealProgress}
        />
      </main>
      <Footer revealProgress={revealProgress} />
    </>
  );
}

function App() {
  useEffect(() => {
    document.body.classList.add('crt-enabled');
    return () => document.body.classList.remove('crt-enabled');
  }, []);

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
