import { useEffect, useRef } from 'react';
import APlayer from 'aplayer';

const songs = [
  {
    name: 'Glass Lung',
    artist: 'Ximm',
    url: '/songs/Ximm - Glass Lung.m4a',
    cover: '/songs/Ximm - Glass Lung.jpg',
  },
];

export default function MusicPlayer() {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const retryIntervalRef = useRef(null);

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
          ap.play().then(() => {
            if (retryIntervalRef.current) {
              clearInterval(retryIntervalRef.current);
              retryIntervalRef.current = null;
            }
          }).catch(() => {
            retryIntervalRef.current = setInterval(() => {
              if (ap.paused) {
                ap.play().catch(() => {});
              }
            }, 5000);
          });
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
