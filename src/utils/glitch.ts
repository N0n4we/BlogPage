// Character pool for glitch corruption effect.
// Unicode block glyphs, ASCII noise symbols, and combining diacritics.
export const GLITCH_CHARS: string[] = [
  '▓', '▒', '░', '█', '▌', '▀', '▄', '■', '□', '▪', '▫',
  '◌', '҉', '\u0335', '\u0337', '\u0338',
  '@', '#', '$', '%', '&', '*', '+', '=',
  '0', '1', '⌂', '¶', '§', '±',
  'ぁ', 'あ', 'ァ', 'ア', 'ㄅ', 'ㄆ', 'ㄇ',
];

export function getRandomGlitchChar(): string {
  return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
}

/** Generate a string of `length` independent random glitch characters. */
export function getRandomGlitchString(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += getRandomGlitchChar();
  }
  return s;
}

// Walk all #text nodes under root, skipping those inside <pre>, <code>,
// or already inside a glitch span (so glitches don't nest on each other).
// Collects nodes first (TreeWalker is live and would skip nodes during mutation),
// then invokes callback for each.
export function walkTextNodes(
  root: HTMLElement,
  callback: (node: Text) => void
): void {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Node): number {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_SKIP;
        const tag = parent.tagName.toLowerCase();
        if (tag === 'pre' || tag === 'code') {
          return NodeFilter.FILTER_SKIP;
        }
        // Skip text already inside a glitch span — incremental updates
        // shouldn't nest new glitches inside existing ones.
        let p: HTMLElement | null = parent;
        while (p && p !== root) {
          if (
            p.classList.contains('glitch-blackout') ||
            p.classList.contains('glitch-chars') ||
            p.classList.contains('glitch-chars-mid') ||
            p.classList.contains('glitch-chars-back') ||
            p.classList.contains('glitch-chars-group')
          ) {
            return NodeFilter.FILTER_SKIP;
          }
          p = p.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  for (const node of textNodes) {
    callback(node);
  }
}

// Remove a random subset of existing glitch spans (without normalizing across
// the whole tree, to keep behavior incremental). Returns how many were removed.
export function removeSomeGlitchSpans(
  root: HTMLElement,
  removeProbability: number
): number {
  const spans = root.querySelectorAll('.glitch-blackout, .glitch-chars-group');
  let removed = 0;
  for (let i = spans.length - 1; i >= 0; i--) {
    if (Math.random() >= removeProbability) continue;
    const span = spans[i];
    // For groups, extract text from one layer to avoid 3× concatenation.
    const text =
      span.classList.contains('glitch-chars-group')
        ? (span.querySelector('.glitch-chars-mid') as HTMLElement | null)
            ?.textContent ||
          (span.querySelector('.glitch-chars') as HTMLElement | null)
            ?.textContent ||
          span.textContent ||
          ''
        : span.textContent || '';
    span.replaceWith(document.createTextNode(text));
    removed++;
  }
  if (removed > 0) root.normalize();
  return removed;
}

// Splits textNode at [start, start+length), wraps the middle in
// <span class="glitch-blackout">, and replaces the original node.
// Uses independent scale & translate CSS properties to coexist with any
// CSS animation that sets `transform` (e.g. glitch-jitter).
export function applyBlackout(
  textNode: Text,
  start: number,
  length: number
): void {
  const text = textNode.textContent || '';
  const parent = textNode.parentNode;
  if (!parent || length <= 0 || start >= text.length) return;

  const end = Math.min(start + length, text.length);
  const before = text.slice(0, start);
  const middle = text.slice(start, end);
  const after = text.slice(end);

  const fragment = document.createDocumentFragment();
  if (before) fragment.appendChild(document.createTextNode(before));

  const span = document.createElement('span');
  span.className = 'glitch-blackout';
  // Depth: scale down + translateZ backward.
  // translateZ is a no-op in flat contexts (content area), works in 3D (title).
  // Steeper depth curve gives blackout spans a more pronounced recession,
  // so they read clearly as "behind" the text plane rather than flat gaps.
  const recess = 2 + Math.random() * 9;              // 2–11
  const shrink = (1 - recess * 0.026).toFixed(3);    // 0.974–0.714
  const depth = (-recess * 8).toFixed(0);            // −16 to −88 px
  // Independent properties — won't be overridden by CSS `transform` animations.
  span.style.scale = shrink;
  span.style.translate = `0 0 ${depth}px`;
  span.style.transformOrigin = 'center';
  span.textContent = middle;
  fragment.appendChild(span);

  if (after) fragment.appendChild(document.createTextNode(after));
  parent.replaceChild(fragment, textNode);
}

/**
 * Layer volume preset for multi-layer glitch chars.
 * Each value is randomised within its range at call time.
 */
interface LayerPreset {
  cls: string;
  depthMin: number;
  depthMax: number;
  scaleMin: number;
  scaleMax: number;
  opacityMin: number;
  opacityMax: number;
  offsetXRange: number;
  offsetYRange: number;
}

const LAYER_PRESETS: LayerPreset[] = [
  {
    // Back layer — deepest recess, smallest scale.
    // Raised opacity floor to ensure it reads against dark backgrounds;
    // widened lateral spread so the 3-layer slab is apparent even at
    // subtle card tilt angles (±3–5°).
    cls: 'glitch-chars-back',
    depthMin: -98,
    depthMax: -52,
    scaleMin: 0.70,
    scaleMax: 0.86,
    opacityMin: 0.30,
    opacityMax: 0.48,
    offsetXRange: 5.5,
    offsetYRange: 3.5,
  },
  {
    // Mid layer — moderate recess, sits between the original text plane
    // and the back layer. Scale straddles 1.0 so mid characters feel
    // near-parity with the body text while remaining clearly displaced.
    cls: 'glitch-chars-mid',
    depthMin: -38,
    depthMax: -12,
    scaleMin: 0.88,
    scaleMax: 1.03,
    opacityMin: 0.45,
    opacityMax: 0.70,
    offsetXRange: 3.5,
    offsetYRange: 2.5,
  },
  {
    // Front layer — slightly forward of the text plane, boldest and
    // most opaque. Compressed scale range (max ±8%) avoids the
    // previous ±12% blow-up that could feel cartoonishly oversized.
    cls: 'glitch-chars',
    depthMin: 15,
    depthMax: 55,
    scaleMin: 1.02,
    scaleMax: 1.08,
    opacityMin: 0.85,
    opacityMax: 1.0,
    offsetXRange: 1.5,
    offsetYRange: 1.0,
  },
];

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randBetweenInt(min: number, max: number): number {
  return Math.floor(randBetween(min, max + 1));
}

// Splits textNode at [start, start+length), replaces the middle with a
// 3-layer volumetric glitch group: back, mid, and front layers each at
// independent Z depths, scale, opacity, displacement, and random chars.
// Uses independent CSS `scale` + `translate` properties so the per-layer
// `glitch-jitter` animation (which targets `transform`) doesn't override depth.
export function applyGlitchCharsGroup(
  textNode: Text,
  start: number,
  length: number
): void {
  const text = textNode.textContent || '';
  const parent = textNode.parentNode;
  if (!parent || length <= 0 || start >= text.length) return;

  const end = Math.min(start + length, text.length);
  const before = text.slice(0, start);
  const charCount = end - start;
  const after = text.slice(end);

  const fragment = document.createDocumentFragment();
  if (before) fragment.appendChild(document.createTextNode(before));

  // Outer group — inline-grid so all layers overlap in the same 2D cell.
  const group = document.createElement('span');
  group.className = 'glitch-chars-group';
  group.style.display = 'inline-grid';

  for (const preset of LAYER_PRESETS) {
    const layer = document.createElement('span');
    layer.className = preset.cls;

    const depth = randBetweenInt(preset.depthMin, preset.depthMax);
    const scale = randBetween(preset.scaleMin, preset.scaleMax).toFixed(3);
    const opacity = randBetween(preset.opacityMin, preset.opacityMax).toFixed(2);
    const offX = (
      (Math.random() - 0.5) * 2 * preset.offsetXRange
    ).toFixed(1);
    const offY = (
      (Math.random() - 0.5) * 2 * preset.offsetYRange
    ).toFixed(1);

    // Independent CSS properties avoid being clobbered by `transform` in
    // the glitch-jitter CSS animation.
    layer.style.scale = scale;
    layer.style.translate = `${offX}px ${offY}px ${depth}px`;
    layer.style.opacity = opacity;
    layer.style.gridRow = '1';
    layer.style.gridColumn = '1';

    // Each layer gets independent random glitch characters.
    layer.textContent = getRandomGlitchString(charCount);
    group.appendChild(layer);
  }

  fragment.appendChild(group);
  if (after) fragment.appendChild(document.createTextNode(after));
  parent.replaceChild(fragment, textNode);
}

/** @deprecated Replaced by applyGlitchCharsGroup for multi-layer depth. */
export const applyGlitchChars = applyGlitchCharsGroup;

// Undo all glitch modifications: replace .glitch-blackout and .glitch-chars-group
// elements with their text content, then normalize to merge adjacent text nodes.
// For groups, text is extracted from a single layer to avoid 3× concatenation.
export function restoreGlitchSpans(root: HTMLElement): void {
  const spans = root.querySelectorAll('.glitch-blackout, .glitch-chars-group');
  // Iterate in reverse to handle potential nesting safely
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    const text =
      span.classList.contains('glitch-chars-group')
        ? (span.querySelector('.glitch-chars-mid') as HTMLElement | null)
            ?.textContent ||
          (span.querySelector('.glitch-chars') as HTMLElement | null)
            ?.textContent ||
          span.textContent ||
          ''
        : span.textContent || '';
    span.replaceWith(document.createTextNode(text));
  }
  root.normalize();
}
