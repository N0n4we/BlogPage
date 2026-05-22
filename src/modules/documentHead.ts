/**
 * Single seam for document.title and meta[name="description"] mutations.
 * Captures original values at module init so callers never need to carry defaults.
 */
const ORIGINAL_TITLE = document.title;
const ORIGINAL_META =
  document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';

export const documentHead = {
  setTitle(title: string): void {
    document.title = title;
  },

  setMeta(description: string): void {
    const metaTag = document.querySelector('meta[name="description"]');
    if (metaTag) metaTag.setAttribute('content', description);
  },

  reset(): void {
    document.title = ORIGINAL_TITLE;
    const metaTag = document.querySelector('meta[name="description"]');
    if (metaTag) metaTag.setAttribute('content', ORIGINAL_META);
  },
};
