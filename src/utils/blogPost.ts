import type { BlogPost } from '../types/blog';

const BLOG_POST_FILE_PATTERN = /^(\d{8})-(.+)\.md$/;

export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function parseBlogPostFile(file: string): BlogPost | null {
  const match = BLOG_POST_FILE_PATTERN.exec(file);
  if (!match) return null;

  const [, dateStr, titleSlug] = match;

  return {
    file,
    dateStr,
    title: slugToTitle(titleSlug),
    displayDate: `${dateStr.slice(0, 4)}/${dateStr.slice(4, 6)}/${dateStr.slice(6, 8)}`,
  };
}
