import { useLayoutEffect, useRef, useState } from 'react';
import { getV3Client } from '@/data/v3';
import { MentionSuggestions, mentionToken, useMentionAutocomplete } from './MentionAutocomplete';

export interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
  scope: string;
}

export function MentionInput({ value, onChange, placeholder, disabled, scope }: MentionInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const token = focused && !disabled && !composing ? mentionToken(value, caret) : null;
  const account = getV3Client().readToken();
  const controller = useMentionAutocomplete(token, `${account?.provider}/${account?.username}:${scope}`, (person, range) => {
    const handle = `@${person.username}`;
    const after = value.slice(range.to);
    const next = value.slice(0, range.from) + handle + (/^\s/.test(after) ? after : ` ${after}`);
    pendingCaret.current = range.from + handle.length + 1;
    setCaret(pendingCaret.current);
    onChange(next);
  });
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    input.current?.focus();
    input.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [value, caret]);
  return <>
    <input ref={input} value={value} data-testid="comment-input" placeholder={placeholder} disabled={disabled}
      role="combobox" aria-label={placeholder} aria-autocomplete="list" aria-expanded={controller.open}
      aria-controls={controller.open ? controller.id : undefined} aria-activedescendant={controller.open && controller.people.length ? `${controller.id}-${controller.selected}` : undefined}
      onChange={event => { setFocused(true); setCaret(event.target.selectionStart ?? event.target.value.length); onChange(event.target.value); }}
      onSelect={event => setCaret(event.currentTarget.selectionStart ?? 0)}
      onFocus={() => {
        setFocused(true);
        requestAnimationFrame(() => {
          const el = input.current;
          if (!el || document.activeElement !== el) return;
          const box = el.getBoundingClientRect();
          const viewport = window.visualViewport;
          const top = viewport?.offsetTop || 0;
          const hit = document.elementFromPoint?.(box.left + box.width / 2, box.top + box.height / 2);
          if (box.top < top || box.bottom > top + (viewport?.height || window.innerHeight) || (hit && hit !== el)) el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        });
      }} onBlur={event => { if (!(event.relatedTarget as HTMLElement | null)?.closest('[data-mention-menu]')) setFocused(false); }}
      onCompositionStart={() => { setComposing(true); setFocused(false); }}
      onCompositionEnd={event => { setComposing(false); setFocused(true); setCaret(event.currentTarget.selectionStart ?? 0); }}
      onKeyDown={event => controller.keyDown(event)}
      className="h-11 min-w-0 flex-1 rounded border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" />
    <MentionSuggestions controller={controller} anchor={input.current} />
  </>;
}

/** Stable render seam, used by both social comment-thread entry paths. */
export const renderMentionInput = (props: MentionInputProps) => <MentionInput key={props.scope} {...props} />;
