import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  readCollection,
  removePostFromCollection,
  setCollectionVisibility,
  renameCollection,
  deleteCollection,
  reorderCollection,
  setCollectionCover,
  getGroupsManages,
  type CollectionContents,
  type CollectionVisibility,
} from '@/data';
import { getWapi } from '@/data/wapi';
import { toast, errorMessage } from '@/components/shared/Toast';
import { WallTile } from './UserProfileScreen';
import { mediaRefId } from '@/data/types';
import {
  ArrowLeft,
  Bookmark,
  Inbox,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  X,
  Check,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ImagePlus,
  ListOrdered,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:saved-collection]', ...args);

// ── Saved collection detail (D88) ───────────────────────────────────────────
// The deep-linkable view of a single saved collection: /u/:username/saved/:collectionId
// (the collectionId is the group_id, URL-encoded — the group-detail idiom). The
// URL holds which collection is open (the "address bar is part of the product"
// rule): refresh restores it, back/forward work, and a public collection's link
// is shareable. Renders the saved posts as the profile's own 9:16 wall (the
// WallTile grid) — the same render the profile's Posts tab uses, so a saved post
// looks exactly like it does everywhere else. A dead ref degrades to a
// "no longer available" tile (never a hard fail).
//
// The owner (token.username === the profile username) sees the per-item REMOVE
// affordance + the collection's VISIBILITY toggle (private ⇄ public) + a kebab
// (rename / delete) in the header. A visitor sees a read-only wall (a private
// collection's read 403s → the error state; a public one renders read-only).
// Zero node surface (D60) — a client-side composition of the data seam.

interface SavedCollectionScreenProps {
  /** The profile's username (the personal-collection owner). Unused in group mode. */
  username?: string;
  provider?: string;
  /**
   * When set, this is a **group collection** (a group's playlist) on the route
   * `/groups/:groupId/saved/:collectionId` — the owner is whoever can manage the
   * group (not `token.username === username`), and the back button returns to
   * the group's Saved tab. When absent, it's a personal collection on
   * `/u/:username/saved/:collectionId` (the owner is the profile's username).
   */
  groupId?: string;
  onBack?: () => void;
}

export default function SavedCollectionScreen({ username, provider, groupId, onBack }: SavedCollectionScreenProps) {
  const { collectionId = '' } = useParams();
  const collectionGroupId = decodeURIComponent(collectionId);
  const navigate = useNavigate();

  const token = getWapi().readToken();
  // A group collection's owner is whoever can manage the group (loaded async —
  // the group's manager curates the group's playlists). A personal collection's
  // owner is the profile's username (synchronous, the feed's isOwnPost idiom).
  const [isGroupManager, setIsGroupManager] = useState(false);
  const isOwner = !!token && (groupId ? isGroupManager : token.username === username);

  const [contents, setContents] = useState<CollectionContents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The owner's editing state.
  const [visibility, setVisibility] = useState<CollectionVisibility>('private');
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [removingPostId, setRemovingPostId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // The owner's reorder mode (playlist order) + the in-flight cover set.
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [settingCoverId, setSettingCoverId] = useState<string | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const backToSaved = useCallback(
    () => (onBack ? onBack() : navigate(groupId ? `/groups/${encodeURIComponent(groupId)}?tab=saved` : `/u/${username}?tab=saved`)),
    [onBack, navigate, username, groupId],
  );

  // A group collection's owner is whoever can manage the group (the manager's
  // read — the group's manager curates the group's playlists). Loaded once.
  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;
    getGroupsManages()
      .then((manages) => {
        if (!cancelled) setIsGroupManager(manages.some((g) => g.group_id === groupId));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [groupId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await readCollection(collectionGroupId);
      setContents(c);
      setVisibility((c.face as { visibility?: CollectionVisibility }).visibility || 'private');
      setRenameValue((c.face as { name?: string }).name || '');
      LOG('loaded', { collectionGroupId, posts: c.posts.length });
    } catch (e) {
      console.error('[social:saved-collection] readCollection failed:', e);
      // A non-owner reading a PRIVATE collection 403s (I3) — the read throws.
      // Surface the "not found / no access" state, never a crash.
      setError('This collection is private or no longer available.');
    } finally {
      setLoading(false);
    }
  }, [collectionGroupId]);

  useEffect(() => {
    load();
  }, [load]);

  // Close the kebab on Escape (design.md §11: anything a mouse can do, Esc can
  // do). The menu also closes on toggle (the button) — no outside-click
  // listener (it races the menu-item click in fast interactions).
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // The owner's visibility toggle (private ⇄ public) — adds/removes the
  // `anyone` reader row (the D58 publicness-is-a-role-grant idiom).
  const handleToggleVisibility = useCallback(async () => {
    const next: CollectionVisibility = visibility === 'public' ? 'private' : 'public';
    setTogglingVisibility(true);
    try {
      await setCollectionVisibility(collectionGroupId, next);
      setVisibility(next);
      toast.success(next === 'public' ? 'Collection is now public' : 'Collection is now private');
    } catch (e) {
      console.error('[social:saved-collection] visibility toggle failed:', e);
      toast.error(errorMessage(e, 'Could not change the collection visibility.'));
    } finally {
      setTogglingVisibility(false);
    }
  }, [collectionGroupId, visibility]);

  // The owner's per-item remove (delete the `saved` doc — a no-op if already
  // gone). Optimistic: drop the tile now, roll back on failure.
  const handleRemovePost = useCallback(
    async (postId: string) => {
      if (!contents) return;
      setRemovingPostId(postId);
      const prev = contents.posts;
      // Optimistic: remove the tile.
      setContents({ ...contents, posts: contents.posts.filter((sp) => sp.postId !== postId) });
      try {
        await removePostFromCollection(collectionGroupId, postId);
      } catch (e) {
        console.error('[social:saved-collection] remove failed:', e);
        setContents({ ...contents, posts: prev }); // roll back
        toast.error(errorMessage(e, 'Could not remove the post.'));
      } finally {
        setRemovingPostId(null);
      }
    },
    [contents, collectionGroupId],
  );

  const handleRename = useCallback(async () => {
    const name = renameValue.trim();
    if (!name) return;
    try {
      await renameCollection(collectionGroupId, name);
      setContents((c) => (c ? { ...c, face: { ...c.face, name } } : c));
      setRenaming(false);
      setMenuOpen(false);
      toast.success('Collection renamed');
    } catch (e) {
      console.error('[social:saved-collection] rename failed:', e);
      toast.error(errorMessage(e, 'Could not rename the collection.'));
    }
  }, [collectionGroupId, renameValue]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteCollection(collectionGroupId);
      toast.success('Collection deleted');
      navigate(groupId ? `/groups/${encodeURIComponent(groupId)}?tab=saved` : `/u/${username}?tab=saved`);
    } catch (e) {
      console.error('[social:saved-collection] delete failed:', e);
      toast.error(errorMessage(e, 'Could not delete the collection.'));
    }
  }, [collectionGroupId, groupId, navigate, username]);

  // ── Reorder (playlist order) ──────────────────────────────────────────────
  // The owner's curated sequence. Reorder mode is a local view state (the URL
  // already holds which collection is open — the "address bar is part of the
  // product" rule); entering it does not change the URL. The order itself is
  // persisted by `reorderCollection` (each `saved` doc's `position`), so a
  // refresh restores the owner's sequence.
  const availablePosts = contents?.posts.filter((sp) => !sp.unavailable && sp.post) ?? [];

  // Enter reorder mode (a no-op with <2 items — nothing to order).
  const handleEnterReorder = useCallback(() => {
    if (availablePosts.length < 2) return;
    setReorderMode(true);
  }, [availablePosts.length]);

  // A local move within the current order (drag or the up/down buttons).
  const moveItem = useCallback((from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setContents((c) => {
      if (!c) return c;
      const next = [...c.posts];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...c, posts: next };
    });
  }, []);

  // Persist the current order (the owner's playlist sequence).
  const handleSaveOrder = useCallback(async () => {
    if (!contents) return;
    const orderedPostIds = contents.posts
      .filter((sp) => !sp.unavailable && sp.post)
      .map((sp) => sp.postId);
    setSavingOrder(true);
    try {
      await reorderCollection(collectionGroupId, orderedPostIds);
      setReorderMode(false);
      toast.success('Order saved');
    } catch (e) {
      console.error('[social:saved-collection] reorder failed:', e);
      toast.error(errorMessage(e, 'Could not save the order.'));
    } finally {
      setSavingOrder(false);
    }
  }, [contents, collectionGroupId]);

  // Cancel reorder mode — roll back to the persisted order (re-read).
  const handleCancelReorder = useCallback(() => {
    setReorderMode(false);
    void load();
  }, [load]);

  // The owner's "Set as cover" — pin this item's media as the collection's
  // thumbnail (the face's avatar_ref).
  const handleSetCover = useCallback(
    async (postId: string) => {
      setSettingCoverId(postId);
      try {
        await setCollectionCover(collectionGroupId, postId);
        toast.success('Cover updated');
      } catch (e) {
        console.error('[social:saved-collection] set cover failed:', e);
        toast.error(errorMessage(e, 'Could not set the cover.'));
      } finally {
        setSettingCoverId(null);
      }
    },
    [collectionGroupId],
  );

  const name = (contents?.face as { name?: string } | undefined)?.name || 'Collection';
  const posts = contents?.posts ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header — back to the Saved tab + the collection face + the owner's
          controls (the visibility toggle + a kebab for rename / delete). */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border" data-testid="saved-collection-header">
        <button
          onClick={backToSaved}
          aria-label="Back to collections"
          data-testid="saved-collection-back"
          className="p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2} />
        </button>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              onSubmit={(e) => { e.preventDefault(); void handleRename(); }}
              className="flex items-center gap-2"
              data-testid="saved-collection-rename-form"
            >
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                aria-label="Collection name"
                data-testid="saved-collection-rename-input"
                className="min-w-0 flex-1 rounded-md border border-input bg-elevated px-3 py-1.5 text-sm font-display font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="submit" disabled={!renameValue.trim()} aria-label="Save name" data-testid="saved-collection-rename-save" className="p-1.5 rounded-md text-brand hover:bg-elevated disabled:opacity-50 transition-colors">
                <Check className="w-4 h-4" strokeWidth={2.5} />
              </button>
              <button type="button" onClick={() => setRenaming(false)} aria-label="Cancel" data-testid="saved-collection-rename-cancel" className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors">
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </form>
          ) : (
            <h1 className="font-display font-semibold text-foreground text-lg truncate" data-testid="saved-collection-name">{name}</h1>
          )}
          <p className="text-xs text-muted-foreground">
            {posts.length} item{posts.length === 1 ? '' : 's'} · {visibility === 'public' ? 'Public' : 'Private'}
          </p>
        </div>

        {isOwner && (
          <div className="flex items-center gap-1">
            {/* The reorder toggle (playlist order) — owner only, ≥2 items. */}
            {availablePosts.length >= 2 && !reorderMode && (
              <button
                type="button"
                onClick={handleEnterReorder}
                aria-label="Reorder items"
                data-testid="saved-collection-reorder"
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-elevated transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ListOrdered className="w-4 h-4" strokeWidth={2} />
                <span className="hidden sm:inline">Reorder</span>
              </button>
            )}

            {/* The visibility toggle (private ⇄ public) — the D58 role-grant. */}
            <button
              type="button"
              onClick={() => void handleToggleVisibility()}
              disabled={togglingVisibility}
              data-testid="saved-collection-visibility"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-elevated transition-colors disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {togglingVisibility ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : visibility === 'public' ? (
                <EyeOff className="w-4 h-4" strokeWidth={2} />
              ) : (
                <Eye className="w-4 h-4" strokeWidth={2} />
              )}
              <span className="hidden sm:inline">{visibility === 'public' ? 'Make private' : 'Make public'}</span>
            </button>

            {/* The kebab — rename / delete (the owner's collection controls). */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Collection options"
                data-testid="saved-collection-menu-button"
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MoreHorizontal className="w-5 h-5" strokeWidth={2} />
              </button>
              {menuOpen && (
                <div
                  data-testid="saved-collection-menu"
                  className="absolute right-0 top-full mt-1 w-44 rounded-md border border-border bg-card shadow-lg z-20 py-1"
                >
                  <button
                    type="button"
                    onClick={() => { setRenameValue(name); setRenaming(true); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors"
                    data-testid="saved-collection-rename"
                  >
                    <Pencil className="w-4 h-4" />
                    Rename
                  </button>
                  {deleteConfirm ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger-muted transition-colors"
                      data-testid="saved-collection-delete-confirm"
                    >
                      <Trash2 className="w-4 h-4" />
                      Confirm delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(true)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-danger-muted transition-colors"
                      data-testid="saved-collection-delete"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete collection
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* The reorder bar — shown only while the owner is reordering (the
          playlist sequence). Save persists the order; Cancel rolls back. */}
      {isOwner && reorderMode && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-elevated/40" data-testid="saved-reorder-bar">
          <p className="text-xs text-muted-foreground">Drag items (or use the arrows) to set the order</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCancelReorder}
              data-testid="saved-reorder-cancel"
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveOrder()}
              disabled={savingOrder}
              data-testid="saved-reorder-save"
              className="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-600 transition-colors disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {savingOrder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
              Save order
            </button>
          </div>
        </div>
      )}

      {/* The wall of saved posts (the profile's own 9:16 grid). */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="grid grid-cols-3 gap-0.5 sm:gap-2 lg:grid-cols-4" data-testid="saved-collection-loading">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[9/16] rounded-lg bg-elevated animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="py-16 text-center" data-testid="saved-collection-error">
            <Inbox className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : posts.length ? (
          <div className="grid grid-cols-3 gap-0.5 sm:gap-2 lg:grid-cols-4" data-testid="saved-collection-wall">
            {posts.map((sp, index) => {
              if (sp.unavailable || !sp.post) {
                return (
                  <div
                    key={sp._id || sp.postId}
                    data-testid="saved-unavailable"
                    className="aspect-[9/16] w-full bg-elevated rounded-lg flex flex-col items-center justify-center gap-2 p-4"
                  >
                    <Inbox className="w-6 h-6 text-muted-foreground/60" strokeWidth={1.5} />
                    <p className="text-xs text-muted-foreground text-center">No longer available</p>
                  </div>
                );
              }
              const post = sp.post;
              const firstMedia = post.media_refs?.length ? contents!.mediaMap[mediaRefId(post.media_refs[0])] : null;
              const hasMedia = !!firstMedia;
              const isRemoving = removingPostId === post._id;
              const isSettingCover = settingCoverId === post._id;
              // In reorder mode the tile is a draggable row (drag to reorder +
              // the up/down arrows); the remove/cover affordances are hidden so
              // the tile reads as "being ordered", not "being managed".
              return (
                <div
                  key={sp._id || sp.postId}
                  className="relative group/tile"
                  draggable={reorderMode}
                  onDragStart={(e) => {
                    if (!reorderMode) return;
                    dragIndexRef.current = index;
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (!reorderMode) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    if (!reorderMode) return;
                    e.preventDefault();
                    const from = dragIndexRef.current;
                    dragIndexRef.current = null;
                    if (from === null || from === index) return;
                    moveItem(from, index);
                  }}
                  onDragEnd={() => { dragIndexRef.current = null; }}
                >
                  <WallTile
                    media={firstMedia ?? { _id: post._id, url: '', created_at: '' }}
                    testId="saved-post-cell"
                    title={post.title}
                    caption={post.text}
                    postId={post._id}
                    multiCount={post.media_refs?.length}
                    onClick={() => { if (!reorderMode) navigate(groupId ? `/watch/${post._id}` : `/u/${username}/p/${post._id}`); }}
                  />

                  {/* Reorder mode: the grip + up/down arrows (top-left). */}
                  {isOwner && reorderMode && (
                    <div className="absolute top-2 left-2 z-10 flex flex-col items-center gap-1">
                      <span className="flex items-center justify-center w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm text-white cursor-grab active:cursor-grabbing" aria-hidden="true">
                        <GripVertical className="w-4 h-4" strokeWidth={2} />
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); moveItem(index, index - 1); }}
                        disabled={index === 0}
                        aria-label="Move up"
                        data-testid="saved-post-move-up"
                        className="flex items-center justify-center w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 disabled:opacity-40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronUp className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); moveItem(index, index + 1); }}
                        disabled={index === posts.length - 1}
                        aria-label="Move down"
                        data-testid="saved-post-move-down"
                        className="flex items-center justify-center w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 disabled:opacity-40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ChevronDown className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                    </div>
                  )}

                  {/* Normal mode (owner): "Set as cover" (top-left, media only). */}
                  {isOwner && !reorderMode && hasMedia && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleSetCover(post._id || ''); }}
                      disabled={isSettingCover}
                      aria-label="Set as cover"
                      data-testid="saved-post-set-cover"
                      className={cn(
                        'absolute top-2 left-2 z-10 flex items-center justify-center w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 disabled:opacity-50',
                        'opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                    >
                      {isSettingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" strokeWidth={2} />}
                    </button>
                  )}

                  {/* Normal mode (owner): the per-item remove (top-right). */}
                  {isOwner && !reorderMode && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleRemovePost(post._id || ''); }}
                      disabled={isRemoving}
                      aria-label="Remove from collection"
                      data-testid="saved-post-remove"
                      className={cn(
                        'absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded-md bg-black/60 backdrop-blur-sm text-white',
                        'opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                    >
                      {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" strokeWidth={2.5} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center" data-testid="saved-collection-empty">
            <Bookmark className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">Nothing saved here yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
