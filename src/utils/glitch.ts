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
            p.classList.contains('glitch-chars')
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
  const spans = root.querySelectorAll('.glitch-blackout, .glitch-chars');
  let removed = 0;
  for (let i = spans.length - 1; i >= 0; i--) {
    if (Math.random() >= removeProbability) continue;
    const span = spans[i];
    const text = span.textContent || '';
    span.replaceWith(document.createTextNode(text));
    removed++;
  }
  if (removed > 0) root.normalize();
  return removed;
}

// Splits textNode at [start, start+length), wraps the middle in
// <span class="glitch-blackout">, and replaces the original node.
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
  span.textContent = middle;
  fragment.appendChild(span);

  if (after) fragment.appendChild(document.createTextNode(after));
  parent.replaceChild(fragment, textNode);
}

// Splits textNode at [start, start+length), replaces the middle with
// random glitch characters in <span class="glitch-chars">,
// and replaces the original node.
export function applyGlitchChars(
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

  const glitched = Array.from(middle)
    .map(() => getRandomGlitchChar())
    .join('');

  const fragment = document.createDocumentFragment();
  if (before) fragment.appendChild(document.createTextNode(before));

  const span = document.createElement('span');
  span.className = 'glitch-chars';
  span.textContent = glitched;
  fragment.appendChild(span);

  if (after) fragment.appendChild(document.createTextNode(after));
  parent.replaceChild(fragment, textNode);
}

// Undo all glitch modifications: replace .glitch-blackout and .glitch-chars
// spans with their text content, then normalize to merge adjacent text nodes.
export function restoreGlitchSpans(root: HTMLElement): void {
  const spans = root.querySelectorAll('.glitch-blackout, .glitch-chars');
  // Iterate in reverse to handle potential nesting safely
  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    const text = span.textContent || '';
    span.replaceWith(document.createTextNode(text));
  }
  root.normalize();
}
