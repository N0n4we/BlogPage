import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import AmbientGlow from './components/AmbientGlow';
import Footer from './components/Footer';
import MusicPlayer from './components/MusicPlayer';
import BlogPostList from './components/BlogPostList';
import CustomCursor from './components/CustomCursor';
import { usePostNavigation } from './hooks/usePostNavigation';

function BlogPage() {
  const { expandedPostId, togglePost, hasEverExpanded } = usePostNavigation();

  return (
    <>
      <Header hasEverExpanded={hasEverExpanded} />
      <main className="main">
        <MusicPlayer />
        <BlogPostList
          expandedPostId={expandedPostId}
          onPostToggle={togglePost}
        />
      </main>
      <Footer />
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
      <AmbientGlow />
      <CustomCursor />
      <Routes>
        <Route path="/" element={<BlogPage />} />
        <Route path="/:dateId" element={<BlogPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
