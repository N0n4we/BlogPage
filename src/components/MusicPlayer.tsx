import { useEffect, useRef, useState } from 'react';
import APlayer from 'aplayer';
import AudioVisualizer from './AudioVisualizer';

interface Song {
  name: string;
  artist: string;
  url: string;
  cover: string;
}

const assetUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.split('/').map(encodeURIComponent).join('/')}`;

const songs: Song[] = [
  {
    name: 'MIA',
    artist: 'raiwinnn',
    url: assetUrl('songs/raiwinnn - MIA.mp3'),
    cover: assetUrl('songs/raiwinnn - MIA.jpg'),
  },
  {
    name: 'iN_mY_BED',
    artist: 'vulx',
    url: assetUrl('songs/vulx - iN_mY_BED.mp3'),
    cover: assetUrl('songs/vulx - iN_mY_BED.jpg'),
  },
];

export default function MusicPlayer({ travelDist }: { travelDist: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<APlayer | null>(null);
  const visWrapperRef = useRef<HTMLDivElement>(null);
  const musicPostRef = useRef<HTMLDivElement>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visReady, setVisReady] = useState(false);
  const [visHeight, setVisHeight] = useState(160);
  const initialGapRef = useRef(0);

  /* ---------- Visualizer height: derived from travelDist (no own scroll listener) ----------
   * useScrollStage tracks scroll position; we react to travelDist changes to
   * compute visHeight = max(160, initialGap - scrollY). */
  useEffect(() => {
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
    setVisReady(true);
  }, [travelDist]);

  // Invalidate initialGap on resize so it's recalculated on next travelDist change
  useEffect(() => {
    const handleResize = () => { initialGapRef.current = 0; };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const randomSong = songs[Math.floor(Math.random() * songs.length)];

    const ap = new APlayer({
      container: containerRef.current,
      listFolded: true,
      autoplay: false,
      theme: '#282828',
      audio: [randomSong]
    });

    playerRef.current = ap;

    // Expose the underlying <audio> element for the visualizer
    const audio = (ap as unknown as { audio: HTMLAudioElement }).audio;
    if (audio) setAudioElement(audio);

    // Browsers block audible autoplay until the first user interaction.
    // Start playback on that first click/key press, then remove the listeners
    // so later clicks can still pause or control the player normally.
    let interactionHandled = false;
    const removeInteractionListeners = () => {
      window.removeEventListener('click', startAfterInteraction);
      window.removeEventListener('keydown', startAfterInteraction);
    };
    const startAfterInteraction = () => {
      if (interactionHandled) return;
      interactionHandled = true;
      // APlayer.play() handles the native play() promise internally and does
      // not return it. Chaining .then() here therefore throws on interaction.
      ap.play();
    };
    window.addEventListener('click', startAfterInteraction);
    window.addEventListener('keydown', startAfterInteraction);

    ap.on('play', () => {
      setIsPlaying(true);
      removeInteractionListeners();
    });
    ap.on('pause', () => setIsPlaying(false));

    return () => {
      removeInteractionListeners();
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
