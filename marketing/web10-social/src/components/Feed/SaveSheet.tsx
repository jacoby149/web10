import { useEffect, useState } from 'react';
import { X, Bookmark, Check, Plus, Loader2 } from 'lucide-react';
import { useSave } from '@/context/SaveContext';
import {
  getMyCollections,
  readSavedPostIds,
  savePostToCollection,
  removePostFromCollection,
  createCollection,
} from '@/data';
import type { CollectionRecord } from '@/data/saved';
import { toast, errorMessage } from '@/components/shared/Toast';
import { trackEvent } from '@/lib/analytics';

/**
 * The app-level "Save to…" sheet (D88, saved-collections.md). Opened from a
 * post surface's kebab (`openSave(post)`) — it lists the user's collections
 * (a checkmark on the ones already containing the post) + a "New collection"
 * row. Tapping a collection toggles the save (optimistic, the like/repost
 * idiom): an unsaved collection saves the post into it, a saved one removes
 * it. "New collection" creates a collection and saves the post into it.
 *
 * The dialog idiom (design.md §8): a bottom sheet on mobile, a centered modal
 * on desktop (`sm:items-center`), a blurred backdrop, a header with a close X,
 * Esc closes. Owner-of-the-token only — surfaces hide the Save control when
 * not signed in (an anon visitor has no collections).
 */
export function SaveSheet() {
  const { saveOpen, savingPost, closeSave } = useSave();
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [savedIn, setSavedIn] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // Load the collections + which ones already contain the post, on open.
  useEffect(() => {
    if (!saveOpen || !savingPost?._id) return;
    let cancelled = false;
    setLoading(true);
    setNewOpen(false);
    setNewName('');
    (async () => {
      try {
        const cols = await getMyCollections();
        const ids = await readSavedPostIdsAll(cols, savingPost._id!);
        if (cancelled) return;
        setCollections(cols);
        // A collection "contains" the post when its id is in the saved set.
        setSavedIn(new Set(cols.filter((c) => ids.has(c.groupId)).map((c) => c.groupId)));
      } catch (e) {
        console.error('[social-save] load failed:', e);
        if (!cancelled) toast.error(errorMessage(e, 'Could not load your collections.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [saveOpen, savingPost?._id]);

  // Esc closes (design.md §11: anything a mouse can do, Esc can do).
  useEffect(() => {
    if (!saveOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSave();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saveOpen, closeSave]);

  if (!saveOpen || !savingPost) return null;
  const postId = savingPost._id || '';

  // Toggle a collection: save the post into it (if not already) or remove it.
  // Optimistic (the like/repost idiom) — flip the checkmark now, roll back on
  // failure.
  async function toggleCollection(col: CollectionRecord) {
    if (!postId) return;
    const isSaved = savedIn.has(col.groupId);
    setTogglingId(col.groupId);
    const prev = new Set(savedIn);
    const next = new Set(savedIn);
    if (isSaved) next.delete(col.groupId);
    else next.add(col.groupId);
    setSavedIn(next);
    try {
      if (isSaved) {
        await removePostFromCollection(col.groupId, postId);
        toast.success(`Removed from ${col.name}`);
      } else {
        await savePostToCollection(col.groupId, postId);
        trackEvent('post_saved');
        toast.success(`Saved to ${col.name}`);
      }
    } catch (e) {
      console.error('[social-save] toggle failed:', e);
      setSavedIn(prev); // roll back
      toast.error(errorMessage(e, 'Could not update the collection.'));
    } finally {
      setTogglingId(null);
    }
  }

  // Create a new collection and save the post into it.
  async function handleCreate() {
    const name = newName.trim();
    if (!name || !postId) return;
    setCreating(true);
    try {
      const groupId = await createCollection(name, { visibility: 'private' });
      await savePostToCollection(groupId, postId);
      trackEvent('collection_created');
      const col: CollectionRecord = {
        groupId,
        name,
        visibility: 'private',
        itemCount: 1,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
      };
      setCollections((prev) => [...prev, col]);
      setSavedIn((prev) => new Set(prev).add(groupId));
      setNewOpen(false);
      setNewName('');
      toast.success(`Saved to ${name}`);
    } catch (e) {
      console.error('[social-save] create failed:', e);
      toast.error(errorMessage(e, 'Could not create the collection.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-3 pb-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Save to collection"
      data-testid="save-sheet"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-overlay-in"
        onClick={closeSave}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card shadow-[0_-8px_30px_rgb(0,0,0,0.35)] sm:rounded-lg animate-panel-in"
        data-testid="save-sheet-panel"
      >
        <div className="sticky top-0 z-10 relative border-b border-border bg-card px-4 py-3">
          <h3 className="flex items-center justify-center gap-2 font-display text-base font-medium text-foreground">
            <Bookmark className="w-4 h-4 text-brand" strokeWidth={2} />
            Save to collection
            {savedIn.size > 0 && (
              <span className="text-xs font-medium text-brand-300" data-testid="save-sheet-saved-count">
                · {savedIn.size}
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={closeSave}
            aria-label="Close"
            data-testid="save-sheet-close"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground" data-testid="save-sheet-loading">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading collections…</span>
            </div>
          ) : (
            <>
              {collections.map((col) => {
                const isSaved = savedIn.has(col.groupId);
                const isToggling = togglingId === col.groupId;
                return (
                  <button
                    key={col.groupId}
                    type="button"
                    onClick={() => void toggleCollection(col)}
                    disabled={isToggling}
                    aria-pressed={isSaved}
                    data-testid="save-collection-row"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-elevated transition-colors disabled:opacity-50"
                  >
                    <span
                      className={
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ' +
                        (isSaved
                          ? 'border-brand bg-brand text-brand-foreground'
                          : 'border-border bg-transparent text-transparent')
                      }
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{col.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {col.itemCount} item{col.itemCount === 1 ? '' : 's'}
                      </span>
                    </span>
                    {isToggling && <Loader2 className="w-4 h-4 shrink-0 animate-spin text-muted-foreground" />}
                  </button>
                );
              })}

              {newOpen ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); void handleCreate(); }}
                  className="flex items-center gap-2 px-3 py-2"
                  data-testid="save-new-collection-form"
                >
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Collection name"
                    aria-label="New collection name"
                    data-testid="save-new-collection-input"
                    className="min-w-0 flex-1 rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="submit"
                    disabled={!newName.trim() || creating}
                    className="shrink-0 rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-600 transition-colors disabled:opacity-50"
                    data-testid="save-new-collection-create"
                  >
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNewOpen(false); setNewName(''); }}
                    aria-label="Cancel"
                    className="shrink-0 p-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setNewOpen(true)}
                  data-testid="save-new-collection"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-brand-300 hover:bg-elevated transition-colors"
                >
                  <Plus className="w-4 h-4" strokeWidth={2} />
                  New collection
                </button>
              )}

              {collections.length === 0 && !newOpen && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No collections yet — create one to start saving.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The set of collection group_ids that contain a post. `readSavedPostIds`
 * reads ONE collection's saved posts, so this fans out across the user's
 * collections (the list is small — a handful of playlists). A per-collection
 * failure degrades to "not saved" (the checkmark just stays off).
 */
async function readSavedPostIdsAll(cols: CollectionRecord[], postId: string): Promise<Set<string>> {
  const out = new Set<string>();
  await Promise.all(
    cols.map(async (c) => {
      const ids = await readSavedPostIds(c.groupId);
      if (ids.has(postId)) out.add(c.groupId);
    }),
  );
  return out;
}
