import MarkdownIt from 'markdown-it';
import { mentionMatches, mentionUsername } from '@web10/discover/mentions';

const markdown = new MarkdownIt({ html: true, linkify: true });

/** Derive the local people-tag index from prose, never code/emails/link labels. */
export function mentionedUsernames(text?: string): string[] {
  const people = new Set<string>();
  for (const block of markdown.parse(text || '', {})) {
    let linkDepth = 0;
    for (const token of block.children || []) {
      if (token.type === 'link_open') {
        linkDepth++;
        const username = mentionUsername(token.attrGet('href') || '');
        if (username) people.add(username);
      } else if (token.type === 'link_close') linkDepth--;
      else if (token.type === 'text' && !linkDepth) {
        for (const match of mentionMatches(token.content)) people.add(match.username);
      }
    }
  }
  return [...people];
}
