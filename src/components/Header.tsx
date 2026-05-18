import { useRef, useState, useEffect } from 'react';
import { useScrollPosition } from '../hooks/useScrollPosition';
import { useGlitchEffect } from '../hooks/useGlitchEffect';

const POST_EXPANDED_KEY = 'n0n4w3_post_expanded';
const POST_EXPANDED_EVENT = 'n0n4w3-post-expanded';

export default function Header() {
  const isFolded = useScrollPosition();
  const logoRef = useRef<HTMLHeadingElement>(null);
  const [glitchEnabled, setGlitchEnabled] = useState(false);

  useEffect(() => {
    // 如果之前已经展开过 post，直接启用 glitch
    if (localStorage.getItem(POST_EXPANDED_KEY)) {
      setGlitchEnabled(true);
      return;
    }

    // 否则等待首次展开 post 的事件
    const handler = () => setGlitchEnabled(true);
    window.addEventListener(POST_EXPANDED_EVENT, handler);
    return () => window.removeEventListener(POST_EXPANDED_EVENT, handler);
  }, []);

  useGlitchEffect(logoRef, {
    enabled: glitchEnabled,
    intensity: 'light',
  });

  return (
    <header className="header">
      <div className="container">
        <h1 ref={logoRef} className={`logo ${isFolded ? 'folded' : ''}`}>
          <span className="logo-part logo-part-N">N</span>
          <span className="logo-part logo-part-container">
            <span className="logo-part logo-part-0n4w3">0n4w3</span>
            <span className="logo-part logo-part-oname">oname</span>
          </span>
        </h1>
      </div>
    </header>
  );
}
