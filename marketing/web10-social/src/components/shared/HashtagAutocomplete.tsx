import { Hash } from 'lucide-react';
import { hashtagPostCount, searchHashtags, type HashtagSuggestion } from '@/data/hashtagSearch';
import { TokenSuggestions, useTokenAutocomplete, type MentionToken } from './MentionAutocomplete';

/** Full token replacement, including the suffix when the caret is in its middle. */
export function hashtagToken(text: string, caret: number): MentionToken | null {
  const before = text.slice(0, caret);
  const match = /(^|[\s(])#([a-zA-Z0-9_]{0,30})$/.exec(before);
  if (!match) return null;
  const suffix = /^[a-zA-Z0-9_]*/.exec(text.slice(caret))![0];
  const query = match[2] + suffix;
  if (query.length > 30) return null;
  if ((before.match(/`/g)?.length || 0) % 2 || /\]\([^)]*$|\[[^\]]*$|https?:\/\/\S*$/.test(before)) return null;
  if (/^\s{0,3}#{1,6}\s/.test(text)) return null;
  return { from: caret - match[2].length - 1, to: caret + suffix.length, query: query.toLowerCase() };
}

export function useHashtagAutocomplete(token: MentionToken | null, scope: string, choose: (item: HashtagSuggestion, token: MentionToken) => void) {
  return useTokenAutocomplete(token, scope, choose, searchHashtags);
}

export function HashtagSuggestions(props: { controller: ReturnType<typeof useHashtagAutocomplete>; anchor: HTMLElement | null; getRect?: () => { top: number; bottom: number; left: number } }) {
  return <TokenSuggestions {...props} copy={{ title: 'Hashtags · public posts on this node', label: 'Matching hashtags', loading: 'Finding hashtags', error: "Couldn't find hashtags. Your draft is safe.", empty: 'No matching hashtags yet. Keep typing to start a new one.', footer: '↑↓ to choose · Enter to complete · Esc to close', testId: 'hashtag-suggestions' }} itemKey={item => item.hashtag} renderItem={item => <>
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-muted text-brand-300"><Hash className="h-4 w-4" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{`#${item.hashtag}`}</span>{' '}
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title={`${item.postCount.toLocaleString('en')} ${item.postCount === 1 ? 'public post' : 'public posts'}`} aria-label={`${item.postCount.toLocaleString('en')} ${item.postCount === 1 ? 'public post' : 'public posts'}`}>{hashtagPostCount(item.postCount)}</span>
  </>} />;
}
