import { useEffect, useRef, useState } from 'react';

export interface ContentPipelineResult {
  html: string;
  summary: string;
  loading: boolean;
  error: string | null;
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => HTML_ESCAPE[character]);
}

/**
 * Fetches and parses one markdown post when it is expanded.
 *
 * A successfully parsed post stays cached in its mounted card. In-flight work
 * is aborted when the card closes, so stale responses cannot update it later.
 */
export function useContentPipeline(postFile: string | null): ContentPipelineResult {
  const [html, setHtml] = useState('');
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedPostFileRef = useRef<string | null>(null);

  useEffect(() => {
    if (!postFile || loadedPostFileRef.current === postFile) return;

    const file = postFile;
    const controller = new AbortController();
    setError(null);
    setLoading(true);

    async function loadContent() {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}blogs/${encodeURIComponent(file)}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const markdown = await response.text();
        // Keep the markdown parser and its WASM payload out of the initial
        // list bundle. They are only needed after a post is opened.
        const { createSummaryFromMarkdown, parseMarkdownWithFootnotes } =
          await import('../utils/markdown');
        if (controller.signal.aborted) return;

        const parsedHtml = await parseMarkdownWithFootnotes(markdown);

        if (controller.signal.aborted) return;

        loadedPostFileRef.current = file;
        setSummary(createSummaryFromMarkdown(markdown));
        setHtml(parsedHtml);
      } catch (err) {
        if (controller.signal.aborted) return;

        const message = err instanceof Error ? err.message : String(err);
        setHtml(`<p class="content-load-error">加载失败：${escapeHtml(message)}</p>`);
        setError(message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadContent();
    return () => controller.abort();
  }, [postFile]);

  return { html, summary, loading, error };
}
