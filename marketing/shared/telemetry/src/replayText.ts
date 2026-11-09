// D107: visible by default. Only explicit sensitive regions/fields are masked;
// product copy and public content need no recording-specific allowlist.
export const PRIVATE_SELECTOR = 'input, textarea, select, [contenteditable], [data-replay-private], .ph-mask, .ph-no-capture';
const PRIVATE_TAGS = new Set(['input', 'textarea', 'select', 'script', 'style']);

export function replayText(text: string, element?: HTMLElement | null): string {
  if (!element || element.closest(PRIVATE_SELECTOR)) return '[masked]';
  return text;
}

// PostHog's pinned option allowlist does not expose rrweb inlineImages. Use
// its supported attribute callback, without changing the live image/CORS or
// making a new fetch. Only already-decoded, readable pixels can be copied.
export function replayAttribute(name: string, value: string, element?: Element): string {
  if (name !== 'src' || element?.tagName !== 'IMG') return value;
  if (element.closest(PRIVATE_SELECTOR)) return '';
  const image = element as HTMLImageElement;
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return '';
  try {
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.8);
  } catch { return ''; }
}

type NodePolicy = { parent?: number; tag: boolean; marked: boolean; editable: boolean; maskedClass: boolean };

// rrweb mutations carry IDs, not ancestors. Keep only structural policy (never
// text) across wire batches so updates cannot bypass the snapshot's boundary.
export function createReplayTextPolicy() {
  const nodes = new Map<number, NodePolicy>();
  const register = (node: any, parent?: number) => {
    if (!node || typeof node !== 'object') return;
    if (Number.isInteger(node.id)) {
      const attrs = node.attributes ?? {};
      nodes.set(node.id, {
        parent,
        tag: PRIVATE_TAGS.has(node.tagName), marked: 'data-replay-private' in attrs,
        editable: 'contenteditable' in attrs,
        maskedClass: /(?:^|\s)ph-(?:mask|no-capture)(?:\s|$)/.test(attrs.class ?? ''),
      });
    }
    for (const child of node.childNodes ?? []) register(child, node.id);
  };
  const allowed = (id: number): boolean => {
    const seen = new Set<number>();
    while (nodes.has(id) && !seen.has(id)) {
      seen.add(id);
      const policy = nodes.get(id)!;
      if (policy.tag || policy.marked || policy.editable || policy.maskedClass) return false;
      if (policy.parent === undefined) return true;
      id = policy.parent;
    }
    return false;
  };
  return {
    allowed,
    observe(event: any) {
      if (event?.type === 2) { nodes.clear(); register(event.data?.node); }
      if (event?.type === 3 && event.data?.source === 0) {
        // Apply privacy changes before text changes, even in the same batch.
        for (const entry of event.data.attributes ?? []) {
          const attrs = entry.attributes ?? {};
          const policy = nodes.get(entry.id);
          if (policy && ('data-replay-private' in attrs || 'contenteditable' in attrs || 'class' in attrs)) {
            if ('data-replay-private' in attrs) policy.marked = attrs['data-replay-private'] !== null;
            if ('contenteditable' in attrs) policy.editable = attrs.contenteditable !== null;
            if ('class' in attrs) policy.maskedClass = /(?:^|\s)ph-(?:mask|no-capture)(?:\s|$)/.test(attrs.class ?? '');
          }
        }
        for (const removal of event.data.removes ?? []) {
          // Descendants lose their path to a known root, even before their own
          // removal arrives. Reused IDs get a new policy when added.
          nodes.delete(removal.id);
        }
        for (const addition of event.data.adds ?? []) register(addition.node, addition.parentId);
      }
      if (nodes.size > 100000) nodes.clear();
    },
  };
}
