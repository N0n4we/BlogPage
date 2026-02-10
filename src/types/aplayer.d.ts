declare module 'aplayer' {
  interface APlayerAudio {
    name: string;
    artist: string;
    url: string;
    cover: string;
    lrc?: string;
    theme?: string;
  }

  interface APlayerOptions {
    container: HTMLElement;
    fixed?: boolean;
    mini?: boolean;
    autoplay?: boolean;
    theme?: string;
    loop?: 'all' | 'one' | 'none';
    order?: 'list' | 'random';
    preload?: 'none' | 'metadata' | 'auto';
    volume?: number;
    audio: APlayerAudio | APlayerAudio[];
    mutex?: boolean;
    lrcType?: number;
    listFolded?: boolean;
    listMaxHeight?: number;
    storageName?: string;
  }

  class APlayer {
    constructor(options: APlayerOptions);
    play(): Promise<void>;
    pause(): void;
    seek(time: number): void;
    toggle(): void;
    on(event: string, handler: () => void): void;
    destroy(): void;
    paused: boolean;
    audio: HTMLAudioElement;
  }

  export default APlayer;
}
