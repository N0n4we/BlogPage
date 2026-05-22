import { useEffect, useRef, useState, useCallback } from 'react';
import APlayer from 'aplayer';
import AudioVisualizer from './AudioVisualizer';



interface Song {
  name: string;
  artist: string;
  url: string;
  cover: string;
}

const songs: Song[] = [
  {
    name: 'item storage',
    artist: 'slowly, slowly',
    url: '/songs/slowly, slowly - item storage.mp3',
    cover: '/songs/slowly, slowly - item storage.jpg',
  },
];

export default function MusicPlayer({ travelDist }: { travelDist: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<APlayer | null>(null);
  const visWrapperRef = useRef<HTMLDivElement>(null);
  const musicPostRef = useRef<HTMLDivElement>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visReady, setVisReady] = useState(false);
  const [visHeight, setVisHeight] = useState(160);
  const initialGapRef = useRef(0);

  /* ---------- Scroll‑driven visualizer: fill gap → shrink to 160px ---------- */
  const calcOffset = useCallback(() => {
    const postEl = musicPostRef.current;
    if (!postEl) return;
    const playerBottom = postEl.getBoundingClientRect().bottom;
    const viewH = window.innerHeight;
    const gap = viewH - playerBottom;

    if (initialGapRef.current === 0 && gap > 160) {
      initialGapRef.current = gap;
    }
    const initialGap = initialGapRef.current || gap;

    const h = Math.max(160, initialGap - window.scrollY);

    setVisHeight(Math.round(h));
    if (!visReady) setVisReady(true);

    // Stop when first post hits viewport top or height reaches 160
    if (h <= 160 || (travelDist > 0 && window.scrollY >= travelDist)) {
      setVisHeight(160);
      window.removeEventListener('scroll', calcOffset);
    }
  }, [visReady]);

  useEffect(() => {
    calcOffset();
    window.addEventListener('scroll', calcOffset, { passive: true } as AddEventListenerOptions);
    window.addEventListener('resize', calcOffset);
    return () => {
      window.removeEventListener('scroll', calcOffset);
      window.removeEventListener('resize', calcOffset);
    };
  }, [calcOffset]);

  useEffect(() => {
    if (!containerRef.current) return;

    const randomSong = songs[Math.floor(Math.random() * songs.length)];

    const ap = new APlayer({
      container: containerRef.current,
      listFolded: true,
      autoplay: true,
      theme: '#282828',
      audio: [randomSong]
    });

    playerRef.current = ap;

    // Re-measure visualizer height after APlayer renders
    requestAnimationFrame(() => calcOffset());

    // Expose the underlying <audio> element for the visualizer
    const audio = (ap as unknown as { audio: HTMLAudioElement }).audio;
    if (audio) setAudioElement(audio);

    let autoplayAttempted = false;

    ap.on('canplay', () => {
      if (!autoplayAttempted) {
        autoplayAttempted = true;
        setTimeout(() => {
          try {
            ap.play();
          } catch {
            // 自动播放被浏览器阻止，启动重试
            retryIntervalRef.current = setInterval(() => {
              if (ap.paused) {
                try { ap.play(); } catch { /* ignore */ }
              }
            }, 5000);
          }
        }, 3000);
      }
    });

    ap.on('play', () => {
      setIsPlaying(true);
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
    });
    ap.on('pause', () => setIsPlaying(false));

    return () => {
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
      }
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, []);

  return (
    <div className="music-player-post" ref={musicPostRef}>
      <div className="music-player">
        <div style={{ textAlign: 'center' }}>
          <div ref={containerRef} id="aplayer"></div>
        </div>
      </div>
      {visReady && (
        <div
          ref={visWrapperRef}
          style={{
            height: `${visHeight}px`,
            display: 'flex',
            alignItems: 'center',
            transition: 'height 0.2s linear',
          }}
        >
          <AudioVisualizer audioElement={audioElement} isPlaying={isPlaying} height={visHeight} />
        </div>
      )}
    </div>
  );
}
