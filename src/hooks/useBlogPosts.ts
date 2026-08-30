import { useEffect, useState } from 'react';
import type { BlogPost } from '../types/blog';
import { parseBlogPostFile } from '../utils/blogPost';

interface UseBlogPostsResult {
  posts: BlogPost[];
  loading: boolean;
  error: string | null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

const MANIFEST_URL = `${import.meta.env.BASE_URL}blogs/manifest.json`;

export function useBlogPosts(): UseBlogPostsResult {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchBlogList() {
      try {
        const response = await fetch(MANIFEST_URL, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const files: unknown = await response.json();
        if (!isStringArray(files)) throw new Error('文章索引格式无效');

        if (controller.signal.aborted) return;
        const nextPosts = files
          .map(parseBlogPostFile)
          .filter((post): post is BlogPost => post !== null)
          .sort((left, right) =>
            right.dateStr.localeCompare(left.dateStr) || left.file.localeCompare(right.file),
          );

        setPosts(nextPosts);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void fetchBlogList();
    return () => controller.abort();
  }, []);

  return { posts, loading, error };
}
