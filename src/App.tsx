import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import { trackPageView } from './modules/analytics';

import MusicPlayer from './components/MusicPlayer';
import BlogPostList from './components/BlogPostList';

import { usePostNavigation } from './hooks/usePostNavigation';
import { useScrollStage } from './hooks/useScrollStage';

function BlogPage() {
  const { expandedPostId, togglePost } = usePostNavigation();
  const { revealProgress, blogRef } = useScrollStage();
  const mainRef = useRef<HTMLElement>(null);

  return (
    <>
      <Header />
      <main className="main" ref={mainRef}>
        <MusicPlayer />
        <BlogPostList
          ref={blogRef}
          expandedPostId={expandedPostId}
          onPostToggle={togglePost}
          revealProgress={revealProgress}
        />
      </main>
    </>
  );
}

function AnalyticsTracker() {
  const location = useLocation();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    // Use the browser path so deployments under a Vite base path include the
    // repository prefix in Analytics as well.
    const pagePath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (lastPathRef.current === pagePath) return;

    lastPathRef.current = pagePath;
    trackPageView(pagePath);
  }, [location.pathname, location.search, location.hash]);

  return null;
}

function App() {
  useEffect(() => {
    document.body.classList.add('crt-enabled');
    return () => document.body.classList.remove('crt-enabled');
  }, []);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AnalyticsTracker />
      <Routes>
        <Route path="/" element={<BlogPage />} />
        <Route path="/:dateId" element={<BlogPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
