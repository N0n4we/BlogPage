import { useState, useEffect } from 'react';

// Unicode emoji ranges: [start, end]
const EMOJI_RANGES: [number, number][] = [
  [0x1F600, 0x1F64F],  // Emoticons
  [0x1F300, 0x1F5FF],  // Misc Symbols & Pictographs
  [0x1F680, 0x1F6FF],  // Transport & Map
  [0x1F900, 0x1F9FF],  // Supplemental Symbols
  [0x1FA70, 0x1FAFF],  // Symbols Extended-A
  [0x2600, 0x26FF],    // Misc Symbols
  [0x2700, 0x27BF],    // Dingbats
];

function randomEmoji(): string {
  const totalSize = EMOJI_RANGES.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
  let pick = Math.floor(Math.random() * totalSize);
  for (const [start, end] of EMOJI_RANGES) {
    const size = end - start + 1;
    if (pick < size) return String.fromCodePoint(start + pick);
    pick -= size;
  }
  return '😋'; // fallback
}

const ORIGINAL_RIGHTS = 'All rights reserved.';

function swapRandomChars(str: string): string {
  const chars = str.split('');
  const i = Math.floor(Math.random() * chars.length);
  let j = Math.floor(Math.random() * chars.length);
  if (j === i) j = (i + 1) % chars.length;
  [chars[i], chars[j]] = [chars[j], chars[i]];
  return chars.join('');
}

export default function Footer({ revealProgress }: { revealProgress: number }) {
  const [emoji, setEmoji] = useState('😋');
  const [rights, setRights] = useState(ORIGINAL_RIGHTS);

  useEffect(() => {
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        setEmoji(randomEmoji());
        setRights(prev => (Math.random() < 0.45 ? swapRandomChars(prev) : prev));
      }, 150);

      return () => clearInterval(interval);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <footer className="footer">
      <div
        className="container"
        style={{
          opacity: revealProgress,
          transform: `translateY(${(1 - revealProgress) * 20}px)`,
        }}
      >
        <p>
          {/* Status badge — uncomment and replace monitor-id after Uptime Kuma setup */}
          {/* <a href="https://status.n0n4w3.cn" target="_blank" rel="noopener noreferrer" className="status-badge">
            <img
              src="https://status.n0n4w3.cn/api/badge/1/status?style=flat&label=n0n4w3.cn"
              alt="n0n4w3.cn status"
              height="20"
            />
          </a> */}
          &copy;2025 N0n4w3. {rights} {emoji}
        </p>
      </div>
    </footer>
  );
}
