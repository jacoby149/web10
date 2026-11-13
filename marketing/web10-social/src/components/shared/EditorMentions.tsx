import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { getV3Client } from '@/data/v3';
import { MentionSuggestions, mentionToken, useMentionAutocomplete, type MentionToken } from './MentionAutocomplete';
import { HashtagSuggestions, hashtagToken, useHashtagAutocomplete } from './HashtagAutocomplete';

/** Tiptap adapter for the same @/# pickers used by every comment input. */
export function EditorMentions({ editor, scope }: { editor: Editor; scope: string }) {
  const [range, setRange] = useState<MentionToken | null>(null);
  const [hashRange, setHashRange] = useState<MentionToken | null>(null);
  const account = getV3Client().readToken();
  const scopeKey = `${JSON.stringify(account)}:${scope}`;
  const mentions = useMentionAutocomplete(range, scopeKey, (person, token) => {
    if (!editor.isFocused || !editor.state.selection.empty) return;
    const after = editor.state.doc.textBetween(token.to, Math.min(token.to + 1, editor.state.doc.content.size));
    const content = [{ type: 'text', text: `@${person.username}`, marks: [{ type: 'link', attrs: { href: `web10:${person.username}` } }] },
      ...(/^\s/.test(after) ? [] : [{ type: 'text', text: ' ' }])];
    editor.chain().focus().insertContentAt({ from: token.from, to: token.to }, content)
      .setTextSelection(token.from + person.username.length + 2).unsetLink().run();
    setRange(null);
  });
  const hashtags = useHashtagAutocomplete(hashRange, scopeKey, (item, token) => {
    if (!editor.isFocused || !editor.state.selection.empty) return;
    const after = editor.state.doc.textBetween(token.to, Math.min(token.to + 1, editor.state.doc.content.size));
    const text = `#${item.hashtag}${/^\s/.test(after) ? '' : ' '}`;
    editor.chain().focus().insertContentAt({ from: token.from, to: token.to }, [{ type: 'text', text }])
      .setTextSelection(token.from + item.hashtag.length + 2).run();
    setHashRange(null);
  });
  const controller = hashRange ? hashtags : mentions;
  useEffect(() => {
    const onUpdate = () => {
      // Replacing the text of an existing person link must not retain its old
      // recipient. Unwrap changed tag runs in the edited paragraph first.
      const { selection, tr } = editor.state;
      const start = selection.$from.start();
      const runs: Array<{ href: string; text: string; from: number; to: number }> = [];
      selection.$from.parent.forEach((node, offset) => {
        const href = node.marks.find(mark => mark.type.name === 'link')?.attrs.href;
        if (typeof href !== 'string' || !href.startsWith('web10:')) return;
        const from = start + offset;
        const previous = runs[runs.length - 1];
        if (previous?.href === href && previous.to === from) { previous.text += node.textContent; previous.to += node.nodeSize; }
        else runs.push({ href, text: node.textContent, from, to: from + node.nodeSize });
      });
      for (const run of runs) if (run.text !== `@${run.href.slice(6)}`) tr.removeMark(run.from, run.to, editor.schema.marks.link);
      if (tr.docChanged) { editor.view.dispatch(tr); return; }
      update();
    };
    const update = () => {
      const clear = () => { setRange(null); setHashRange(null); };
      if (editor.isDestroyed || editor.view.composing) { clear(); return; }
      const selection = editor.state.selection;
      if (!editor.isFocused || !selection.empty || editor.isActive('code') || editor.isActive('codeBlock') || editor.isActive('link')) { clear(); return; }
      const start = selection.$from.start();
      const text = selection.$from.parent.textContent;
      const token = mentionToken(text, selection.from - start);
      const hash = editor.isActive('heading') ? null : hashtagToken(text, selection.from - start);
      setRange(token ? { ...token, from: token.from + start, to: token.to + start } : null);
      setHashRange(hash ? { ...hash, from: hash.from + start, to: hash.to + start } : null);
    };
    const blur = ({ event }: { event: FocusEvent }) => {
      if (!(event.relatedTarget as HTMLElement | null)?.closest('[data-mention-menu]')) { setRange(null); setHashRange(null); }
    };
    editor.on('update', onUpdate); editor.on('selectionUpdate', update); editor.on('focus', update); editor.on('blur', blur);
    return () => { editor.off('update', onUpdate); editor.off('selectionUpdate', update); editor.off('focus', update); editor.off('blur', blur); };
  }, [editor]);
  useEffect(() => {
    const dom = editor.view.dom;
    if (controller.open) {
      dom.setAttribute('aria-autocomplete', 'list'); dom.setAttribute('aria-controls', controller.id); dom.setAttribute('aria-expanded', 'true');
      if (controller.people.length) dom.setAttribute('aria-activedescendant', `${controller.id}-${controller.selected}`);
      else dom.removeAttribute('aria-activedescendant');
    }
    const keyDown = (event: KeyboardEvent) => controller.keyDown({ key: event.key, preventDefault: () => event.preventDefault(), stopPropagation: () => { event.stopPropagation(); event.stopImmediatePropagation(); }, nativeEvent: event });
    const composition = () => { setRange(null); setHashRange(null); };
    dom.addEventListener('keydown', keyDown, true); dom.addEventListener('compositionstart', composition);
    return () => {
      dom.removeEventListener('keydown', keyDown, true); dom.removeEventListener('compositionstart', composition);
      for (const name of ['aria-autocomplete', 'aria-controls', 'aria-expanded', 'aria-activedescendant']) dom.removeAttribute(name);
    };
  }, [editor, controller]);
  const caretRect = useCallback(() => {
    try { const box = editor.view.coordsAtPos(editor.state.selection.from); return { top: box.top, bottom: box.bottom, left: box.left }; }
    catch { return editor.view.dom.getBoundingClientRect(); }
  }, [editor, range?.from, range?.to, hashRange?.from, hashRange?.to]);
  return hashRange ? <HashtagSuggestions controller={hashtags} anchor={editor.view.dom} getRect={caretRect} /> : <MentionSuggestions controller={mentions} anchor={editor.view.dom} getRect={caretRect} />;
}
