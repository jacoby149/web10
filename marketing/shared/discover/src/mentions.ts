// Local-node people tags. Shared by the markdown renderers and social's indexer.
export function mentionMatches(text: string): Array<{ username: string; start: number; end: number }> {
  return [...text.matchAll(/(^|[\s([{,;:!?])@([a-zA-Z0-9_-]{1,64})(?![a-zA-Z0-9_-]|\.[a-zA-Z0-9])/g)].map((match) => ({
    username: match[2],
    start: match.index! + match[1].length,
    end: match.index! + match[0].length,
  }));
}

export function mentionUsername(url: string): string | null {
  const match = /^web10:([a-zA-Z0-9_-]{1,64})$/.exec(url);
  return match?.[1] ?? null;
}

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

/** Turn prose tags into ordinary safe profile links, never code/HTML/link text. */
export function remarkMentions() {
  return (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      if (['link', 'linkReference', 'code', 'inlineCode', 'html', 'image', 'imageReference'].includes(node.type)) return;
      if (!node.children) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          walk(child);
          return [child];
        }
        const parts: MarkdownNode[] = [];
        let offset = 0;
        for (const match of mentionMatches(child.value)) {
          parts.push({ type: 'text', value: child.value.slice(offset, match.start) });
          parts.push({ type: 'link', url: `/u/${encodeURIComponent(match.username)}`, children: [{ type: 'text', value: `@${match.username}` }] });
          offset = match.end;
        }
        parts.push({ type: 'text', value: child.value.slice(offset) });
        return parts;
      });
    };
    walk(tree);
  };
}
