import { useState, useEffect } from 'react';
import { slugToTitle } from '../utils/markdown';

export function useBlogPosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchBlogList() {
      try {
        // 尝试从 manifest.json 获取博客列表（开发环境和构建后都支持）
        const response = await fetch('/blogs/manifest.json');
        if (response.ok) {
          const files = await response.json();

          const blogPosts = files
            .map(file => {
              const match = file.match(/^(\d{8})-(.*)\.md$/);
              if (!match) return null;

              const [, dateStr, titleSlug] = match;
              const title = slugToTitle(titleSlug);
              let displayDate = 'Invalid Date';
              try {
                const year = dateStr.substring(0, 4);
                const month = dateStr.substring(4, 6);
                const day = dateStr.substring(6, 8);
                displayDate = `${year}/${month}/${day}`;
              } catch (e) {
                console.warn(`Could not parse date from filename: ${file}`);
              }

              return {
                file,
                dateStr,
                title,
                displayDate,
              };
            })
            .filter(Boolean);

          setPosts(blogPosts);
        } else {
          throw new Error(`Failed to fetch manifest: ${response.status}`);
        }
      } catch (err) {
        console.error('Error fetching blog list:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchBlogList();
  }, []);

  return { posts, loading, error };
}
