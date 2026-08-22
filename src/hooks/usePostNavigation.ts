import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { documentHead } from '../modules/documentHead';

const POST_EXPANDED_KEY = 'n0n4w3_post_expanded';

export interface PostNavigation {
  expandedPostId: string | null;
  togglePost: (postDateStr: string) => void;
  hasEverExpanded: boolean;
}

/**
 * Deep module for post navigation: owns expanded-post state, URL synchronisation,
 * localStorage first-expand tracking, and document head reset on close.
 *
 * Interface (3 surface items): expandedPostId, togglePost, hasEverExpanded.
 * Implementation absorbs: URL sync, popstate, localStorage, documentHead calls.
 */
export function usePostNavigation(): PostNavigation {
  const { dateId } = useParams<{ dateId?: string }>();
  const navigate = useNavigate();
  const [expandedPostId, setExpandedPostId] = useState<string | null>(dateId || null);
  const [hasEverExpanded, setHasEverExpanded] = useState(
    () => !!localStorage.getItem(POST_EXPANDED_KEY),
  );

  const markExpanded = useCallback(() => {
    if (hasEverExpanded) return;
    localStorage.setItem(POST_EXPANDED_KEY, '1');
    setHasEverExpanded(true);
  }, [hasEverExpanded]);

  // URL → state sync (direct navigation via /:dateId)
  useEffect(() => {
    if (dateId && dateId !== expandedPostId) {
      setExpandedPostId(dateId);
      markExpanded();
    }
    // Deliberately narrow deps — only react to URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateId]);

  // Browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const match = path.match(/\/(\d{8})$/);
      if (match) {
        setExpandedPostId(match[1]);
      } else {
        setExpandedPostId(null);
        documentHead.reset();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const togglePost = useCallback(
    (postDateStr: string) => {
      if (expandedPostId === postDateStr) {
        setExpandedPostId(null);
        navigate('/', { replace: false });
        documentHead.reset();
      } else {
        setExpandedPostId(postDateStr);
        markExpanded();
        navigate(`/${postDateStr}`, { replace: false });
      }
    },
    [expandedPostId, navigate, markExpanded],
  );

  return { expandedPostId, togglePost, hasEverExpanded };
}
