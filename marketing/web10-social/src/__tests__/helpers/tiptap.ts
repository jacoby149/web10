import { screen, waitFor, act } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * The Tiptap composer test seam. jsdom cannot drive a ProseMirror
 * contenteditable through DOM events (ProseMirror's `beforeinput` handler is a
 * no-op stub that relies on the browser's native contenteditable input, which
 * jsdom does not synthesize, and its click path needs coordinate APIs jsdom
 * lacks). So tests reach the editor through its own command API: the
 * PostComposer exposes the editor instance on the contenteditable node
 * (`[data-testid="composer-textarea"]`).
 *
 * `composerEditor()` returns the editor instance (waits for it to mount).
 * `typeInComposer(text)` inserts text the way a user's input would — it goes
 * through the editor's `insertContent` command, which fires `onUpdate` → the
 * markdown `text` state → `canPost`, exactly as real typing would.
 */
export async function composerEditor(): Promise<any> {
  const el = screen.getByTestId('composer-textarea') as HTMLElement & { __editor?: any };
  await waitFor(() => expect(el.__editor).toBeTruthy());
  return el.__editor;
}

export async function typeInComposer(text: string): Promise<void> {
  const editor = await composerEditor();
  // `insertContent` fires `onUpdate` → the component's `setText` synchronously.
  // Wrap in `act` so React flushes the re-render that recomputes `canPost`
  // before the test asserts on the button / submits — the same wait a real
  // keypress gets for free.
  await act(async () => {
    editor.commands.insertContent(text);
  });
}
