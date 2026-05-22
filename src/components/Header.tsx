import { useRef } from 'react';
import { useScrollPosition } from '../hooks/useScrollPosition';
import { useGlitchEffect } from '../hooks/useGlitchEffect';

interface HeaderProps {
  hasEverExpanded: boolean;
}

export default function Header({ hasEverExpanded }: HeaderProps) {
  const isFolded = useScrollPosition();
  const logoRef = useRef<HTMLHeadingElement>(null);

  useGlitchEffect(logoRef, {
    enabled: hasEverExpanded,
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
