import { useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { documentHead } from '../modules/documentHead';

export interface PostNavigation {
  expandedPostId: string | null;
  togglePost: (postDateStr: string) => void;
}

/**
 * The URL is the single source of truth for the expanded post. This keeps
 * browser back/forward navigation and direct post links in sync without a
 * second state machine in React.
 */
export function usePostNavigation(): PostNavigation {
  const { dateId } = useParams<{ dateId?: string }>();
  const navigate = useNavigate();
  const expandedPostId = dateId ?? null;

  // Browser back/forward to the list must restore the base document metadata.
  useEffect(() => {
    if (!dateId) documentHead.reset();
  }, [dateId]);

  const togglePost = useCallback(
    (postDateStr: string) => {
      if (expandedPostId === postDateStr) {
        navigate('/', { replace: false });
        documentHead.reset();
      } else {
        navigate(`/${postDateStr}`, { replace: false });
      }
    },
    [expandedPostId, navigate],
  );

  return { expandedPostId, togglePost };
}
