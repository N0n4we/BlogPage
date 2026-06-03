import { useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';

import MusicPlayer from './components/MusicPlayer';
import BlogPostList from './components/BlogPostList';

import { usePostNavigation } from './hooks/usePostNavigation';
import { useScrollStage } from './hooks/useScrollStage';

function BlogPage() {
  const { expandedPostId, togglePost, hasEverExpanded } = usePostNavigation();
  const { travelDist, revealProgress, blogRef } = useScrollStage();
  const mainRef = useRef<HTMLElement>(null);

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
