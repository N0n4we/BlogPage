import { useEffect, useRef, useState } from 'react';
import APlayer from 'aplayer';
import { musicRhythm } from '../modules/musicRhythm';

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

export default function MusicPlayer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // No visible visualizer remains. The controller keeps a single, lightweight
  // analyser only to drive page-wide text rhythm.
  useEffect(() => {
    musicRhythm.connect(audioElement);
    return () => musicRhythm.disconnect(audioElement);
  }, [audioElement]);

  useEffect(() => {
    musicRhythm.setPlaying(isPlaying);
  }, [isPlaying]);

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

    // Expose the underlying <audio> element for the page-wide rhythm engine.
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
    ap.on('ended', () => setIsPlaying(false));

    return () => {
      removeInteractionListeners();
      ap.destroy();
    };
  }, []);

  return (
    <div className="music-player-post">
      <div className="music-player">
        <div ref={containerRef} id="aplayer"></div>
      </div>
    </div>
  );
}
