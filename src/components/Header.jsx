import { useScrollPosition } from '../hooks/useScrollPosition';

export default function Header() {
  const isFolded = useScrollPosition();

  return (
    <header className="header">
      <div className="container">
        <h1 className={`logo ${isFolded ? 'folded' : ''}`}>
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
