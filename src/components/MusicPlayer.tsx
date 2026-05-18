import { useEffect, useRef } from 'react';
import APlayer from 'aplayer';

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

export default function MusicPlayer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<APlayer | null>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
    });

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
    <div className="music-player-post">
      <div className="music-player">
        <div style={{ textAlign: 'center' }}>
          <div ref={containerRef} id="aplayer"></div>
        </div>
      </div>
    </div>
  );
}
