# PRD-004: Music Audio Visualizer

- **Status:** Draft
- **Issue:** [#4 — Music audio visualizer](https://github.com/n0n4w3/BlogPage/issues/4)
- **Labels:** `enhancement`, `ready-for-agent`
- **Target release:** v0.4.0

---

## 1. Problem Statement

The blog has a functional music player powered by APlayer (mounted at the top of `<main>`), but the playback experience is purely auditory — there is no visual feedback showing the music's rhythm, frequency content, or dynamic energy. The player sits as a compact UI component with no connection to the surrounding page aesthetic.

Without a real-time audio visualizer, the music player feels disconnected from the site's retro/glitch visual language. A frequency-bar visualizer driven by the Web Audio API will:

- Provide satisfying real-time visual feedback that syncs with the currently playing track
- Reinforce the retro terminal aesthetic with Gruvbox-themed bar rendering
- Make the music player feel like an integrated part of the page rather than an isolated widget
- Give visitors a reason to linger and explore the music while browsing

---

## 2. User Stories

| ID | Story |
|----|-------|
| US-1 | As a **visitor**, I want to see animated frequency bars next to the music player so I get visual feedback that music is playing. |
| US-2 | As a **visitor**, I want the visualizer to be styled in the Gruvbox color palette so it feels consistent with the rest of the site. |
| US-3 | As a **visitor**, I want the visualizer bars to pulse and move in sync with the audio so the effect feels organic and connected to the music. |
| US-4 | As a **visitor**, I want the visualizer to pause its animation when the music is paused or stopped so the frozen state clearly indicates no playback. |
| US-5 | As a **visitor on mobile**, I want the visualizer to still work (or gracefully degrade) so I'm not excluded from the experience. |
| US-6 | As a **developer**, I want the visualizer to derive its audio data from the existing APlayer instance's `<audio>` element so we avoid forking or duplicating playback logic. |
| US-7 | As a **developer**, I want the component to handle the `AudioContext` not being available (e.g., old browsers, restrictive privacy modes) by showing a static placeholder instead of crashing. |
| US-8 | As a **developer**, I want the visualizer to clean up its `AudioContext` and animation loop on unmount so there are no memory leaks or orphaned audio graph nodes. |

---

## 3. Technical Design

### 3.1 Overview

The audio visualizer is a new React component (`AudioVisualizer.tsx`) that connects to the existing APlayer instance's internal `<audio>` element via the Web Audio API. It captures frequency data in `requestAnimationFrame` and renders animated bars using either `<canvas>` or CSS transforms on `<div>` elements.

The APlayer instance exposes `ap.audio` — the native `HTMLAudioElement` that APlayer wraps. The visualizer accesses this element (passed via a ref from `MusicPlayer.tsx`), creates an `AudioContext`, connects the audio element as a source, pipes through an `AnalyserNode`, and reads frequency data on every animation frame.

### 3.2 Architecture

```
┌────────────────────────────────────────────────────────────┐
│                     MusicPlayer.tsx                         │
│  ┌──────────┐     ┌──────────────────────────────────┐     │
│  │  APlayer  │────►│  <audio> (ap.audio)              │     │
│  └──────────┘     │  Exposed via audioRef             │     │
│                   └──────────┬───────────────────────┘     │
│                              │                              │
│                              ▼                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                 AudioVisualizer.tsx                   │  │
│  │                                                       │  │
│  │  AudioContext ──► createMediaElementSource(audio)     │  │
│  │                         │                             │  │
│  │                         ▼                             │  │
│  │                   AnalyserNode                        │  │
│  │                   fftSize: 256                        │  │
│  │                         │                             │  │
│  │                         ▼                             │  │
│  │              getByteFrequencyData()                    │  │
│  │              (Uint8Array, 128 bins)                   │  │
│  │                         │                             │  │
│  │              requestAnimationFrame ◄───────────────── │  │
│  │                         │                             │  │
│  │                         ▼                             │  │
│  │              Render bars (CSS <div> / canvas)         │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 3.3 Web Audio API Pipeline

#### 3.3.1 AudioContext Creation

The `AudioContext` is created lazily when the component mounts and the audio element is available. It is created in a "suspended" state by default due to browser autoplay policy — the context is resumed on the first user interaction or when the APlayer fires a `play` event.

```typescript
const audioContext = new AudioContext();
// audioContext.state === 'suspended' initially
```

#### 3.3.2 Source Node: `createMediaElementSource()`

The `<audio>` element from the APlayer instance is connected as a media source:

```typescript
const source = audioContext.createMediaElementSource(audioElement);
```

**⚠️ Critical constraint:** `createMediaElementSource` can only be called **once** per `<audio>` element. If the visualizer mounts/unmounts repeatedly, it must either:
- Guard against re-connecting an already-connected element, or
- Use a singleton `AudioContext` shared across the lifetime of the page

**Recommended approach:** Create the `AudioContext` once in `MusicPlayer.tsx` (or a shared hook) and pass it down. The visualizer reads from the `AnalyserNode` rather than owning the full graph.

#### 3.3.3 AnalyserNode Configuration

| Property | Value | Rationale |
|----------|-------|-----------|
| `fftSize` | `256` | Produces 128 frequency bins — enough for a smooth bar visualizer without excessive computation |
| `smoothingTimeConstant` | `0.8` | Reduces visual jitter by smoothing frequency data over time; bars move organically rather than hyperkinetically |

```typescript
const analyser = audioContext.createAnalyser();
analyser.fftSize = 256;
analyser.smoothingTimeConstant = 0.8;

source.connect(analyser);
analyser.connect(audioContext.destination); // keep audio playing through speakers
```

#### 3.3.4 Data Extraction

On each animation frame:

```typescript
const bufferLength = analyser.frequencyBinCount; // 128
const dataArray = new Uint8Array(bufferLength);

function render() {
  requestAnimationFrame(render);
  analyser.getByteFrequencyData(dataArray);
  // dataArray[0..127] contains byte values 0–255
  // Map to bar heights
}
```

**Frequency bands mapping:** The 128 bins can be grouped into fewer bars for visual clarity. A good default is **32 bars**, each averaging a group of ~4 adjacent bins. This creates a clean, readable visualizer without overwhelming detail.

```
Grouping:
  Bar 0:  bins 0–3    (low frequencies — bass)
  Bar 1:  bins 4–7
  ...
  Bar 31: bins 124–127 (high frequencies — treble)
```

### 3.4 Rendering Strategy

#### Primary: CSS bar rendering via `<div>` elements

32 `<div>` elements, each styled with a Gruvbox color from a pre-defined gradient array. Bar heights are set via CSS `transform: scaleY()` for GPU-composited performance.

**Advantages:**
- React manages the DOM; no canvas lifecycle
- CSS `transform` is GPU-composited, no layout thrashing
- Accessible (can add `aria-hidden` but DOM is inspectable)
- Easier to style with Gruvbox gradient across bars

```tsx
function AudioVisualizer({ frequencyData }: { frequencyData: Uint8Array }) {
  const bars = groupIntoBars(frequencyData, 32);

  return (
    <div className="audio-visualizer" aria-hidden="true">
      {bars.map((value, i) => (
        <div
          key={i}
          className="audio-visualizer__bar"
          style={{
            transform: `scaleY(${value / 255})`,
            backgroundColor: GRUVBOX_GRADIENT[i % GRUVBOX_GRADIENT.length],
          }}
        />
      ))}
    </div>
  );
}
```

Bars are bottom-aligned within a fixed-height container using `align-items: flex-end` on the flex parent, and `transform-origin: bottom center` on each bar.

#### Alternative: Canvas rendering

If performance testing shows jank with 32+ DOM elements on low-end mobile, fall back to `<canvas>`:

```typescript
function draw(ctx: CanvasRenderingContext2D, data: Uint8Array) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bars = groupIntoBars(data, 64);
  const barWidth = canvas.width / bars.length;

  bars.forEach((value, i) => {
    ctx.fillStyle = GRUVBOX_GRADIENT[i % GRUVBOX_GRADIENT.length];
    ctx.fillRect(i * barWidth, canvas.height, barWidth - 1, -(value / 255) * canvas.height);
  });
}
```

**Recommendation:** Start with CSS bar rendering. If frame drops are observed on mobile, switch to canvas.

### 3.5 Gruvbox Color Gradient

The bars cycle through a subset of Gruvbox's bright palette, creating a warm-to-cool gradient that matches the site's theme:

```typescript
const GRUVBOX_BAR_COLORS = [
  '#fb4934', // bright_red      — bass
  '#fe8019', // bright_orange
  '#fabd2f', // bright_yellow
  '#b8bb26', // bright_green
  '#8ec07c', // bright_aqua
  '#83a598', // bright_blue     — mids
  '#d3869b', // bright_purple
  '#83a598', // bright_blue     — treble
];

// Extended to 32 bars via cycled interpolation
```

Bars flow left-to-right: low frequencies on the left (red/orange) → mid frequencies (yellow/green) → high frequencies on the right (blue/purple).

### 3.6 Play/Pause State Integration

The visualizer must respond to playback state:

| State | Visualizer Behavior |
|-------|-------------------|
| **Playing** | Bars animate in real-time with frequency data |
| **Paused** | Bars freeze at their current positions (last captured data) |
| **Stopped / No track** | All bars flat at 0 height (or a subtle idle animation: low-amplitude slow wave) |
| **Loading / Buffering** | Bars show a gentle bouncing animation to indicate activity |

**Detection:** APlayer fires `play` and `pause` events. The visualizer listens to these to toggle its animation loop:

```typescript
ap.on('play', () => setIsPlaying(true));
ap.on('pause', () => setIsPlaying(false));
```

When paused, the `requestAnimationFrame` loop stops. When resumed, the loop restarts using the stored `AnalyserNode`.

### 3.7 `AudioContext` Not Available Fallback

Some browsers, privacy modes, or older environments may not support `AudioContext`. The visualizer should gracefully degrade:

```typescript
let AudioContextClass: typeof AudioContext;
try {
  AudioContextClass = window.AudioContext
    || (window as any).webkitAudioContext
    || (window as any).mozAudioContext;
  if (!AudioContextClass) throw new Error('AudioContext not supported');
} catch {
  // Show static placeholder
}
```

**Fallback UI:** When `AudioContext` is unavailable, render a static visualizer placeholder with slight CSS animation (e.g., a slow pulsing gradient of Gruvbox colors) to indicate the music player is present but the visualizer cannot receive live data.

### 3.8 Integration with APlayer

The `MusicPlayer.tsx` component needs to:

1. Expose the APlayer instance's `<audio>` element via a ref or callback
2. Forward APlayer `play`/`pause` events to the visualizer

**Recommended approach:** Lift the audio element reference into a ref that `AudioVisualizer` can consume. Since both components are siblings in `BlogPage` (via `App.tsx` → `MusicPlayer`), render `AudioVisualizer` inside `MusicPlayer.tsx` to keep the coupling local.

```tsx
// MusicPlayer.tsx
const audioRef = useRef<HTMLAudioElement | null>(null);

// After APlayer instantiation:
audioRef.current = (ap as any).audio; // ap.audio is the native <audio> element

// Render:
<>
  <div ref={containerRef} id="aplayer" />
  <AudioVisualizer audioElement={audioRef.current} isPlaying={isPlaying} />
</>
```

---

## 4. Expanded Acceptance Criteria

### Visual

- [ ] AC-1: Frequency bars render and animate when music is playing
- [ ] AC-2: Bars use Gruvbox color palette (8 colors cycling) matching the site theme
- [ ] AC-3: Bar heights scale proportionally to frequency amplitude (0–255 mapped to 0–100%)
- [ ] AC-4: Low frequencies render as leftmost bars; high frequencies as rightmost bars
- [ ] AC-5: Bars have subtle rounded corners for polish
- [ ] AC-6: Visualizer has consistent height (e.g., 80–120px) regardless of bar count
- [ ] AC-7: The visualizer does not overflow its container or clip on any viewport width

### Playback State

- [ ] AC-8: Bars freeze when music is paused (last frequency data snapshot displayed)
- [ ] AC-9: Bars resume animation when music is resumed
- [ ] AC-10: Bars render flat (0 height) when no track is loaded
- [ ] AC-11: Visualizer does not produce audio feedback or echo
- [ ] AC-12: No audible artifacts (clicks, pops, distortion) from the Web Audio graph

### Performance

- [ ] AC-13: `requestAnimationFrame` loop runs at 60fps on desktop during playback
- [ ] AC-14: No frame drops on 60Hz displays during visualizer animation
- [ ] AC-15: Animation loop stops when component is unmounted (no orphaned raf)
- [ ] AC-16: `AudioContext` is properly closed on unmount
- [ ] AC-17: No memory leaks — `AnalyserNode` and `MediaElementAudioSourceNode` are disconnected on cleanup
- [ ] AC-18: CSS bar rendering achieves 60fps on mid-range mobile devices

### Error Handling

- [ ] AC-19: If `AudioContext` is unavailable, a static placeholder is shown instead of a blank/crashing component
- [ ] AC-20: If `createMediaElementSource()` fails (e.g., audio element already connected), the visualizer degrades gracefully with a console warning
- [ ] AC-21: If the audio element reference is null (APlayer not yet initialized), the visualizer renders nothing or a loading placeholder
- [ ] AC-22: No JavaScript errors thrown to the console from the visualizer under normal operation

### Accessibility

- [ ] AC-23: The visualizer container has `aria-hidden="true"` since it is purely decorative
- [ ] AC-24: The visualizer does not interfere with keyboard navigation of the page
- [ ] AC-25: `prefers-reduced-motion` media query disables bar animation (static placeholder only)

---

## 5. Implementation Plan

### 5.1 Files to Create

| File | Purpose |
|------|---------|
| `src/components/AudioVisualizer.tsx` | New React component: Web Audio API integration, `requestAnimationFrame` loop, frequency data grouping, bar rendering (CSS `<div>` bars with Gruvbox gradient) |

### 5.2 Files to Modify

| File | Change |
|------|--------|
| `src/components/MusicPlayer.tsx` | Expose the internal `<audio>` element from APlayer via a ref; import and render `<AudioVisualizer>` as a sibling under the player container; forward `play`/`pause` events to visualizer |
| `src/styles.css` | Add `.audio-visualizer` and `.audio-visualizer__bar` styles: flexbox row layout, bar width/spacing, rounded corners, Gruvbox color class helpers, responsive sizing, `prefers-reduced-motion` and `pointer: coarse` media queries, static placeholder fallback styles |

### 5.3 Step-by-Step

1. **Create `AudioVisualizer.tsx`** — Component shell accepting `audioElement: HTMLAudioElement | null` and `isPlaying: boolean` props; mounts `AudioContext` + `AnalyserNode` pipeline; `useEffect` manages lifecycle (connect on mount, disconnect + close on unmount)

2. **Implement frequency data loop** — `requestAnimationFrame` calls `getByteFrequencyData()`, groups 128 bins into 32 bars, stores result in state (or direct DOM manipulation via refs for performance)

3. **Implement bar rendering** — 32 `<div>` elements with CSS `transform: scaleY()` set by frequency data; `transform-origin: bottom center`; Gruvbox gradient array assigned by index; wrapping flex container with `align-items: flex-end`

4. **Wire play/pause** — Visualizer listens to `isPlaying` prop; stops/pauses `requestAnimationFrame` accordingly; shows frozen or flat state

5. **Add fallback** — Try/catch around `AudioContext` construction; render static placeholder on failure

6. **Update `MusicPlayer.tsx`** — Add `audioRef` to capture `ap.audio` after APlayer initialization; compute `isPlaying` via APlayer events; render `<AudioVisualizer>` below the APlayer container

7. **Add CSS** — Layout styles for the visualizer bar container and bars; Gruvbox color classes; responsive breakpoints; `prefers-reduced-motion` disable; `aria-hidden` on container

8. **Test playback states** — Verify play/pause freeze, track loading, browser autoplay policy interaction

### 5.4 Code Review Checklist

- [ ] `AudioContext` is created lazily (not during module evaluation)
- [ ] `createMediaElementSource()` is called at most once per audio element lifetime
- [ ] `requestAnimationFrame` ID is stored and cancelled on unmount
- [ ] `AnalyserNode.disconnect()` called before `AudioContext.close()` during cleanup
- [ ] Frequency data array is allocated once (not re-allocated per frame)
- [ ] Bar elements use `will-change: transform` or `transform: scaleY()` for GPU compositing
- [ ] `aria-hidden="true"` on the visualizer container
- [ ] `prefers-reduced-motion` media query disables animation
- [ ] Fallback placeholder renders when `AudioContext` is unavailable
- [ ] No DOM elements created/destroyed per frame — bars are recycled
- [ ] Visualizer does not create audio feedback loop (no `MediaStreamSource` from output)

---

## 6. Risks and Dependencies

### 6.1 Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| `aplayer` (existing) | Internal | The visualizer depends on APlayer's internal `<audio>` element being accessible via `ap.audio`; this is a documented property of the APlayer instance |
| Web Audio API | External | Supported in all modern browsers (Chrome 35+, Firefox 53+, Safari 14.1+, Edge 79+); `AudioContext` available in all modern environments |
| `AudioContext` availability | External | May be unavailable in: private browsing modes (some browsers), very old browsers (IE11), or when the browser blocks the API entirely |

### 6.2 Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `createMediaElementSource()` throws if the `<audio>` element is already connected to another `AudioContext` | High | Singleton `AudioContext` pattern: create the context once in `MusicPlayer.tsx` and share it; never call `createMediaElementSource` twice on the same element |
| Browser autoplay policy blocks `AudioContext` from starting in suspended state | Medium | Resume `AudioContext` on user interaction (`click`/`tap`/`touchstart`); listen for APlayer's `play` event which is always user-initiated |
| APlayer internal API changes (`ap.audio` property) | Low | Pin APlayer version in `package.json`; wrap access in a try/catch with console warning on failure; add a comment noting the dependency |
| CSS bar rendering causes layout thrashing at 60fps | Medium | Use `transform: scaleY()` instead of `height` — `transform` is GPU-composited; apply `will-change: transform` to bar elements; batch style reads/writes |
| Mobile battery drain from continuous rAF loop | Low | Stop rAF when page is not visible via `document.hidden` / `visibilitychange` event; stop rAF when paused |
| Frequency data appears flat or unresponsive (all bars similar height) | Low | Apply non-linear scaling (e.g., `Math.pow(value / 255, 0.6)`) to emphasize mid and high frequencies; adjust `smoothingTimeConstant` (lower = more responsive) |

### 6.3 Browser Compatibility

| Browser | Web Audio API | Autoplay Policy |
|---------|--------------|-----------------|
| Chrome 120+ | ✅ Full support | Requires user gesture to resume suspended `AudioContext` |
| Firefox 120+ | ✅ Full support | Requires user gesture |
| Safari 17+ | ✅ Full support | Requires user gesture; `AudioContext` may be null in some private modes |
| Edge 120+ | ✅ Full support | Same as Chrome |
| iOS Safari 17+ | ✅ Supported | Requires user gesture; may silently fail in data saver mode |
| Samsung Internet | ✅ Supported | Follows Chrome policy |

### 6.4 APlayer Audio Element Access

APlayer stores the native `<audio>` element at `ap.audio` (or `ap.audioElement` depending on version). This must be verified at implementation time.

```typescript
// Access pattern (confirm property name during implementation)
const audioEl = (ap as any).audio;         // Most common
// or
const audioEl = (ap as any).audioElement;  // Some versions
```

If the property name differs, update the accessor accordingly. The visualizer should accept the audio element as a prop, making this adapter concern the responsibility of `MusicPlayer.tsx`.

---

## 7. Glossary

| Term | Definition |
|------|-----------|
| **Web Audio API** | Browser API for processing and synthesizing audio in web applications; provides `AudioContext`, `AnalyserNode`, and other audio processing nodes |
| **AudioContext** | The primary interface to the Web Audio API; manages all audio nodes in the audio processing graph |
| **AnalyserNode** | An audio processing node that provides real-time frequency and time-domain analysis data without altering the audio signal |
| **fftSize** | The size of the Fast Fourier Transform window used by the `AnalyserNode`; must be a power of 2 between 32 and 32768; determines the number of frequency bins (`fftSize / 2`) |
| **getByteFrequencyData** | Method on `AnalyserNode` that copies current frequency data into a `Uint8Array` with values from 0 to 255 |
| **createMediaElementSource** | Creates a `MediaElementAudioSourceNode` from an existing `<audio>` or `<video>` element for use in the Web Audio graph |
| **frequencyBinCount** | Read-only property of `AnalyserNode` equal to `fftSize / 2`; the number of data values available from frequency analysis |
| **smoothingTimeConstant** | Averaging constant (0–1) applied to the `AnalyserNode`; higher values produce smoother, less jittery frequency data |
| **requestAnimationFrame** | Browser API for scheduling visual updates synchronized with the display refresh rate (~60fps) |
| **Gruvbox** | The retro color palette used throughout this project; warm earth tones with high-contrast bright variants |

---

## 8. Future Considerations

- **Bar count configuration:** Expose a prop or CSS custom property to adjust the number of bars (16/32/64) for performance tuning on low-end devices
- **Visualizer modes:** Add alternative rendering modes — circular visualization, waveform view, spectrogram (2D frequency heatmap)
- **Responsive to BPM:** Detect tempo from frequency data and pulse the visualizer container background in sync with the beat
- **Fullscreen mode:** Expand the visualizer into a full-screen immersive view when the user clicks an expand button
- **Canvas performance fallback:** If CSS bar rendering causes jank on low-end mobile, provide a canvas-based rendering path activated via a `useCanvas` prop
- **Multiple color themes:** Support alternative color gradients beyond the Gruvbox bright palette (e.g., monochrome, inverted, seasonal)
- **Peak indicators:** Small dots or lines above each bar showing the peak frequency value with a slow decay (like a hardware equalizer)
- **Export as GIF/WebM:** Allow users to record and share a short clip of the visualizer with the current track overlay
