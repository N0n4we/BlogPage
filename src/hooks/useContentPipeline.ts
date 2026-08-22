import { useState, useEffect, useRef } from 'react';
import { parseMarkdownWithFootnotes, createSummaryFromMarkdown } from '../utils/markdown';

export interface ContentPipelineResult {
  html: string;
  summary: string;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch + parse a markdown post file into rendered HTML and a plain-text summary.
 *
 * Pass `null` to skip fetching (e.g. when the post is collapsed).
 * Re-fetches only when `postFile` changes to a new value; re-expanding the
 * same post reuses the cached result.
 */
export function useContentPipeline(postFile: string | null): ContentPipelineResult {
  const [html, setHtml] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!postFile || fetchedRef.current === postFile) return;

    fetchedRef.current = postFile;
    setError(null);
    setLoading(true);

    const url = `${import.meta.env.BASE_URL}blogs/${encodeURIComponent(postFile)}`;
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const markdown = await res.text();
        const s = createSummaryFromMarkdown(markdown);
        const h = await parseMarkdownWithFootnotes(markdown);
        setSummary(s);
        setHtml(h);
      })
      .catch((err) => {
        setHtml(
          `<p style="color: var(--warning-color);">加载失败：${err.message}</p>`,
        );
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [postFile]);

  return { html, summary, loading, error };
}
