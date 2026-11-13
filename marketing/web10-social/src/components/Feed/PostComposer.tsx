import { useState, useRef, useEffect, useCallback } from 'react';
import { ReliableImage } from '@web10/discover/image';
import { ReliableVideo } from '@web10/discover/video';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TurndownService from 'turndown';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { createPost, createRepost, updatePost, uploadMedia, readProfile, resolveMediaRefs, fanOutToFollowers, readMyAds, getWapi, readGroupIdentity, getDiscoverGroupId } from '@/data';
import { getActingAuthor, actingPostGroups } from '@/data/actingIdentity';
import { getV3Client } from '@/data/v3';
import { resolveFaceMedia, GROUP_FACE_SQL } from '@web10/discover/face';
import type { MediaRecord, ProfileRecord, Visibility, AdRecord, AdAlbum, PostRecord, ResolvedMediaRef } from '@/data';
import { mediaRefId } from '@/data/types';
import { readSettings } from '@/data/settings';
import {
  validateMedia,
  processImage,
  generateThumbnail,
  captureVideoPoster,
  getVideoInfo,
  getAudioInfo,
  validateVideoDuration,
  type VideoThumbnailSelection,
} from '@/lib/mediaProcessing';
import type { ProcessingError as MediaProcessingError } from '@/lib/mediaProcessing';
import { Image, Paperclip, X, Send, Loader2, AlertTriangle, GripVertical, Globe, Lock, Megaphone, Scissors, Repeat2, Bold, Italic, Strikethrough, Heading2, List, Code, Link as LinkIcon, Film, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdPicker } from './AdPicker';
import { VideoEditorSheet } from './VideoEditorSheet';
import type { VideoEditResult } from './VideoEditorSheet';
import { VideoThumbnailSheet } from './VideoThumbnailSheet';
import { editVideo, isNoopEdit } from '@/lib/videoEditing';
import { markdownToHtml } from '@/lib/markdownHtml';
import { DiscoverAudience } from './DiscoverAudience';
import { MusicTagToggle } from './MusicTagToggle';
import type { MediaPostDraft } from '@/components/Uploads/uploadState';
import { EditorMentions } from '@/components/shared/EditorMentions';
import { AccessRecovery } from '@/components/shared/AccessRecovery';
import { API_ORIGIN } from '@/lib/origins';

let nextMediaId = 0;

/**
 * The paste-to-attach idiom (the third attach path after the picker button and
 * drag-and-drop): when the clipboard carries FILE items that are images — a
 * screenshot from the OS menu bar, a copied photo — collect them as Files so
 * the tray can process them exactly like a picked/dropped file. Text/URL-only
 * pastes return [] and the editor's default paste handling runs untouched
 * (the caption still receives the text). Non-image file items (a copied PDF,
 * …) are ignored — the tray's validation is the picker's validation, and a
 * paste that lands an error card for content the user meant to keep on the
 * clipboard is worse than no paste path at all.
 */
function clipboardImageFiles(clipboard: DataTransfer | null): File[] {
  if (!clipboard) return [];
  const files: File[] = [];
  for (const item of Array.from(clipboard.items)) {
    if (item.kind !== 'file') continue;
    // Clipboard images declare `image/*`; some browsers leave the type empty
    // on copied pixels — an empty-typed file item is treated as an image.
    if (item.type && !item.type.startsWith('image/')) continue;
    const raw = item.getAsFile();
    if (!raw) continue;
    const type = raw.type || item.type || 'image/png';
    const ext =
      type === 'image/jpeg'
        ? 'jpg'
        : type === 'image/webp'
          ? 'webp'
          : type === 'image/gif'
            ? 'gif'
            : 'png';
    // Screenshots arrive nameless or as a generic "image.png" — give every
    // pasted photo a stable, non-colliding name (multiple pastes in one
    // session, or two copies in one clipboard, must not share a file name).
    const name =
      raw.name && raw.name !== 'image.png'
        ? raw.name
        : `pasted-image-${Date.now()}-${files.length + 1}.${ext}`;
    files.push(new File([raw], name, { type }));
  }
  return files;
}

function formatAudioDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

// The markdown converter (D85, rich-text.md "The write side"): Tiptap v3 has no
// built-in `getMarkdown()`, so the editor's HTML (`getHTML()`) is converted to
// markdown with turndown. This is the "markdown stored under the hood" — the
// user writes in a WYSIWYG, the markdown string is what the data layer writes,
// and the renderer (react-markdown) parses it back. ATX headings + fenced code
// blocks + `-` bullets (the GitHub-flavored core the renderer handles).
const markdownConverter = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

interface AttachedMedia {
  id: number;
  file: File;
  previewUrl: string;
  isVideo: boolean;
  isAudio: boolean;
  width: number;
  height: number;
  duration: number;
  altText: string;
  processing: boolean;
  /** True once the user has run the video through the editor (the file is the
   *  finished re-encode). Videos that were never edited get a default encode
   *  (Original ratio, full duration) at post time — the node never sees the
   *  raw original (video-experience.md: "the node never sees the original"). */
  edited?: boolean;
  /** The in-flight post phase for this item (encode → upload). */
  postPhase?: 'encoding' | 'uploading';
  /** 0 → 1 progress for the current postPhase. */
  postProgress?: number;
  /** The album art file for an audio item (optional — the track's cover). */
  albumArt?: File;
  /** The album art preview URL (object URL, revoked on remove/unmount). */
  albumArtUrl?: string;
  /** The creator's video thumbnail pick (video-experience.md "Cover frame
   *  pick"): a captured frame (its `time`) or their own image (`custom`).
   *  Rides the existing `thumbnail_object_key` — zero node surface. A
   *  trim/crop edit drops a frame pick (it no longer matches the re-encode);
   *  a custom image survives. */
  thumbnail?: VideoThumbnailSelection;
  /** The picked thumbnail's preview URL (the tray's poster + chip). */
  thumbnailUrl?: string;
  error?: MediaProcessingError;
}

function MediaTrayItem({
  item,
  index,
  count,
  onRemove,
  onAltTextChange,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onEdit,
  onThumbnail,
  onAlbumArtChange,
  disabled,
}: {
  item: AttachedMedia;
  index: number;
  count: number;
  onRemove: () => void;
  onAltTextChange: (alt: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onEdit?: () => void;
  onThumbnail?: () => void;
  onAlbumArtChange?: (file: File) => void;
  disabled: boolean;
}) {
  const aspectRatio = item.width && item.height ? item.width / item.height : 1;
  const clampedRatio = Math.max(0.5, Math.min(2, aspectRatio));

  return (
    <div
      className="relative group flex-shrink-0"
      style={{ aspectRatio: item.isAudio ? 1 : clampedRatio, maxWidth: '33%' }}
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      {item.isAudio ? (
        <div className="w-full h-full rounded-lg ring-1 ring-border bg-elevated flex flex-col items-center justify-center gap-2 p-2 relative overflow-hidden">
          {item.albumArtUrl ? (
            <ReliableImage
              src={item.albumArtUrl}
              alt="Album art"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-muted to-background flex items-center justify-center">
              <Music className="w-10 h-10 text-brand-300/60" strokeWidth={1.5} />
            </div>
          )}
          <div className="relative z-10 flex flex-col items-center gap-1">
            <Music className="w-6 h-6 text-foreground" strokeWidth={1.75} />
            {item.duration > 0 && (
              <span className="font-mono text-[0.625rem] tabular-nums text-foreground bg-background/70 rounded px-1">
                {formatAudioDuration(item.duration)}
              </span>
            )}
          </div>
          {onAlbumArtChange && (
            // The album-art control is a full attach target, not click-only:
            // pick (the input), drag a cover ONTO it (onDrop), or paste it
            // while it's focused (onPaste — tabIndex makes the chip focusable,
            // the same pixels-on-the-clipboard path as the root's paste).
            <label
              className="relative z-10 mt-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              tabIndex={0}
              data-testid="album-art-chip"
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation(); // the chip IS the target — the root handler must not double-route
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('image/')) onAlbumArtChange(file);
              }}
              onPaste={(e) => {
                const files = clipboardImageFiles(e.clipboardData);
                if (!files.length) return;
                e.preventDefault();
                e.stopPropagation();
                onAlbumArtChange(files[0]);
              }}
            >
              <span className="flex items-center gap-1 text-[0.625rem] font-medium text-foreground bg-background/80 rounded-full px-2 py-0.5 hover:bg-background transition-colors">
                <Image className="w-3 h-3" />
                {item.albumArt ? 'Change art' : 'Add art'}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAlbumArtChange(f);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      ) : item.isVideo ? (
        <ReliableVideo
          src={item.previewUrl}
          poster={item.thumbnailUrl || undefined}
          className="w-full h-full object-cover rounded-lg ring-1 ring-border"
          preload="metadata"
          controls
          muted
          playsInline
        />
      ) : (
        <ReliableImage
          src={item.previewUrl}
          alt={item.altText || `Media ${index + 1}`}
          className="w-full h-full object-cover rounded-lg ring-1 ring-border"
        />
      )}

      {(item.processing || item.postPhase) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/60 rounded-lg">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
          {item.postPhase && (
            <span className="font-mono text-[0.6875rem] tabular-nums text-foreground" data-testid="media-post-progress">
              {item.postPhase === 'encoding' ? 'Encoding' : 'Uploading'} {Math.round((item.postProgress ?? 0) * 100)}%
            </span>
          )}
        </div>
      )}

      {item.error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-danger-muted/90 rounded-lg p-2">
          <AlertTriangle className="w-4 h-4 text-danger mb-1" />
          <span className="text-[0.6875rem] text-danger text-center leading-tight">{item.error.message}</span>
        </div>
      )}

      {item.isVideo && (
        <div className="absolute bottom-1.5 right-1.5 bg-background/80 rounded px-1 text-[0.625rem] font-mono tabular-nums text-foreground">
          {item.width}×{item.height}
        </div>
      )}

      {/* Always-visible remove button — 44px touch target */}
      <button
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${item.isVideo ? 'video' : 'photo'}`}
        className="absolute -top-2 -right-2 flex items-center justify-center h-8 w-8 rounded-full bg-background border border-border shadow-md z-10 hover:bg-elevated transition-colors duration-150"
        style={{ minWidth: 44, minHeight: 44, padding: 0 }}
      >
        <X className="w-4 h-4" />
      </button>

      {/* Edit button — videos only (trim + crop before posting) */}
      {item.isVideo && onEdit && (
        <button
          onClick={onEdit}
          disabled={disabled || item.processing || !!item.error}
          aria-label="Edit video (trim and crop)"
          className="absolute -top-2 -left-2 flex items-center justify-center h-8 w-8 rounded-full bg-background border border-border shadow-md z-10 hover:bg-elevated hover:text-brand transition-colors duration-150 disabled:opacity-50"
          style={{ minWidth: 44, minHeight: 44, padding: 0 }}
          data-testid="media-edit-button"
        >
          <Scissors className="w-4 h-4" />
        </button>
      )}

      {/* Thumbnail chip — videos only (video-experience.md "Cover frame
          pick"): choose the poster from a few captured frames or an own
          image. The tray's poster (above) previews the current pick. */}
      {item.isVideo && onThumbnail && (
        <button
          onClick={onThumbnail}
          disabled={disabled || item.processing || !!item.error}
          aria-label="Choose video thumbnail"
          className="absolute top-1.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[0.625rem] font-medium text-foreground hover:bg-background transition-colors duration-150 disabled:opacity-50"
          data-testid="media-thumbnail-button"
        >
          <Image className="w-3 h-3" />
          {/* Icon-only below the desktop width: on a 375px tray the tile is
              ~115px wide and the labelled chip collides with the 44px
              remove target (the album-art chip is the small-chip precedent). */}
          <span className="hidden sm:inline whitespace-nowrap">
            {item.thumbnail ? 'Change thumbnail' : 'Thumbnail'}
          </span>
        </button>
      )}

      {/* Drag handle — visible on hover/focus, always touchable */}
      <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 cursor-grab active:cursor-grabbing">
        <GripVertical className="w-4 h-4 text-foreground/60" />
      </div>

      {/* Alt text input — appears on hover/focus */}
      <div className="absolute bottom-0 inset-x-0 p-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
        <Input
          value={item.altText}
          onChange={(e) => onAltTextChange(e.target.value)}
          placeholder="Alt text…"
          disabled={disabled}
          className="h-7 text-[0.6875rem] bg-background/90 backdrop-blur-sm border-border/50 placeholder:text-muted-foreground/50"
          aria-label={`Alt text for ${item.isVideo ? 'video' : 'photo'} ${index + 1}`}
        />
      </div>
    </div>
  );
}

/**
 * The repost context block (reposts.md): shown at the top of the composer when
 * it is in repost mode. It renders the ORIGINAL post being reposted — the
 * author, the text (truncated), and the first media item — so the user knows
 * exactly what they're amplifying. The X cancels the repost. Tokens only
 * (design.md): no hardcoded colors.
 */
function RepostContext({ post, onCancel }: { post: PostRecord; onCancel: () => void }) {
  // The original's media: resolved refs (the feed passes them) render a
  // preview; bare doc_ids (a pre-resolution read) show a placeholder.
  const firstRef = (post.media_refs || []).find(Boolean);
  const firstMedia =
    firstRef && typeof firstRef !== 'string' ? (firstRef as ResolvedMediaRef) : null;
  const isVideo = firstMedia?.mime_type?.startsWith('video/');
  const authorName = post.profile?.display_name || post.author_username || 'Original author';

  return (
    <div
      className="mb-3 rounded-lg border border-border bg-elevated/40 overflow-hidden"
      data-testid="repost-context"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="flex items-center gap-1.5 text-xs font-medium text-brand-300">
          <Repeat2 className="w-3.5 h-3.5" strokeWidth={2} />
          Reposting
        </span>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel repost"
          data-testid="repost-cancel"
          className="p-1.5 -mr-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors duration-150"
          style={{ minWidth: 32, minHeight: 32 }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium text-foreground truncate">{authorName}</p>
        {post.text ? (
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
            {post.text}
          </p>
        ) : null}
        {firstMedia ? (
          <div className="mt-2 rounded-md overflow-hidden bg-background">
            {isVideo ? (
              <ReliableVideo
                src={firstMedia.read_url || undefined}
                poster={firstMedia.thumbnail_url || undefined}
                className="w-full max-h-48 object-cover"
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <ReliableImage
                src={firstMedia.thumbnail_url || firstMedia.read_url || ''}
                alt=""
                className="w-full max-h-48 object-cover"
                loading="lazy"
              />
            )}
          </div>
        ) : firstRef ? (
          <p className="mt-1.5 text-xs text-muted-foreground/70">Media attached</p>
        ) : null}
      </div>
    </div>
  );
}

export default function PostComposer({
  onPostCreated,
  repostingTo,
  onRepostCancel,
  groups,
  editingPost,
  draftText,
  compact = false,
  chromeless = false,
  onQueueMediaPost,
}: {
  onPostCreated?: () => void;
  /** Optional queue adapter. Currently supplied only by the upload UI preview. */
  onQueueMediaPost?: (draft: MediaPostDraft) => void | boolean | Promise<void | boolean>;
  /**
   * When set, the composer is in REPOST mode (reposts.md): it shows the
   * original post as a context block and the user's text becomes the repost's
   * comment. Submitting creates a repost post (createRepost) instead of a
   * normal post. `onRepostCancel` clears the state (the X on the context block).
   */
  repostingTo?: PostRecord | null;
  onRepostCancel?: () => void;
  /**
   * The group the post is created in (group composer — the post attaches to
   * the group, not the reader's followers groups). Threaded to createPost.
   */
  groups?: string[];
  /**
   * When set, the composer is in EDIT mode (the ONE edit path — the operator,
   * 30.09.2026: "we definitely need some kind of consistent strategy for all
   * these surfaces"). The title + body (into the Tiptap editor) + media +
   * pinned ad are pre-filled from `editingPost`, and saving calls `updatePost`
   * (not `createPost`) — the same WYSIWYG surface that creates a post, so edit
   * never regresses to a plain textarea or drops the title. Media is
   * remove-only in edit mode (you can't attach new media to an existing post).
   * `onPostCreated` is reused as the "saved" callback (the sheet closes +
   * fires `post-created`, the screens reload and pick up the edit).
   */
  editingPost?: PostRecord;
  draftText?: string;
  /**
   * Compact (collapsed) mode: the composer rests as a single-line "What's on
   * your mind?" bar and expands to the full form on focus. The Discover
   * surface uses it so the video wall, not the composer, is the hero
   * (design.md §10 — the chrome recedes). The feed / profile / group
   * composers stay full-size.
   */
  compact?: boolean;
  /**
   * Chromeless: drop the inline chrome (the horizontal padding + the
   * border-b rule) so the composer can sit inside a container that owns its
   * own padding/borders — the New Post sheet (the app-level modal). The
   * form itself (avatar, title, caption, actions) is unchanged.
   */
  chromeless?: boolean;
}) {
  const isEditing = !!editingPost;
  // Whether the caption has content — a cheap boolean, NOT the markdown. The
  // markdown is computed on demand at submit (a full turndown walk on every
  // keystroke is what made typing laggy). The editor owns the document.
  const [hasText, setHasText] = useState(!!(editingPost?.text || draftText));
  // The post's two bodies of text (D82): `title` (the optional headline) +
  // `text` (the caption). The title leads a card / watch header / short
  // overlay; the caption is the longer body. Optional — a post with no title
  // is caption-only (the pre-D82 shape). In edit mode both are pre-filled from
  // the post being edited.
  const [title, setTitle] = useState(editingPost?.title || '');
  const [mediaItems, setMediaItems] = useState<AttachedMedia[]>([]);
  // A rejected post write must not force the same large video to upload twice.
  // Only completed media, exact file/metadata and the same account/service can
  // be reused. The retry still passes the node's normal document-write checks.
  const completedUploads = useRef(new Map<number, {
    scope: string; file: File; altText: string; albumArt?: File;
    thumbnail?: VideoThumbnailSelection; record: MediaRecord;
  }>());
  useEffect(() => {
    const retained = new Set(mediaItems.map(item => item.id));
    for (const id of completedUploads.current.keys()) if (!retained.has(id)) completedUploads.current.delete(id);
  }, [mediaItems]);
  // Edit mode: the post's current media (remove-only — you can't attach new
  // media to an existing post). Resolved from `editingPost.media_refs` on
  // mount; the surviving items are written back on save.
  const [editMedia, setEditMedia] = useState<MediaRecord[]>([]);
  const [removedEditMediaIds, setRemovedEditMediaIds] = useState<Set<string>>(() => new Set());
  const retainedEditRefs = (editingPost?.media_refs || []).filter((ref) => !removedEditMediaIds.has(mediaRefId(ref)));
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [audienceBusy, setAudienceBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessBlocked, setAccessBlocked] = useState(false);

  function showSubmitError(failure: unknown) {
    // Both normal SDK writes and resumable-upload admission carry HTTP status.
    // This only offers a user-driven review, never assumes approval or retries.
    const blocked = failure instanceof Error && 'status' in failure && (failure.status === 401 || failure.status === 403);
    console.log('[social-composer] submission failed; retaining draft', { accessBlocked: blocked });
    setAccessBlocked(blocked);
    setError(failure instanceof Error ? failure.message : 'Something went wrong. Try again.');
  }
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [visibility, setVisibility] = useState<Visibility>(editingPost?.visibility || (groups && !groups.includes(getDiscoverGroupId()) ? 'private' : 'public'));
  const visibilityTouched = useRef(false);
  // In edit mode the pinned ad is pre-filled from the post's ad_target (a
  // minimal stub — the chip shows "Pinned ad"; the real ad object is only
  // needed for the picker, which loads lazily).
  const [pinnedAd, setPinnedAd] = useState<AdRecord | null>(
    editingPost?.ad_target ? { _id: editingPost.ad_target, text: 'Pinned ad' } : null,
  );
  const [showAdPicker, setShowAdPicker] = useState(false);
  const [ads, setAds] = useState<AdRecord[]>([]);
  const [albums, setAlbums] = useState<AdAlbum[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [editingMediaId, setEditingMediaId] = useState<number | null>(null);
  // The video thumbnail picker (video-experience.md "Cover frame pick"):
  // which tray item's poster the sheet is choosing.
  const [thumbnailMediaId, setThumbnailMediaId] = useState<number | null>(null);
  // The "mark as music" toggle (music.md): opt-in, shown when the post has
  // video media attached. A video CAN be music — checking this sets the same
  // `music` tag the dedicated audio flow sets, so the post appears in the
  // Music tab and the author's profile Music section.
  const [markAsMusic, setMarkAsMusic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragIdRef = useRef<number | null>(null);

  // Capture the draft's identity once. Navigation changes never reauthor it.
  const [authorAs] = useState<string | null>(() => editingPost ? (editingPost.author_key?.includes('/groups/') ? editingPost.author_key : null) : getActingAuthor() || null);
  const [draftHuman] = useState(() => {
    const token = getWapi()?.readToken();
    return token ? { provider: token.provider, username: token.username } : null;
  });
  const [selectedGroup, setSelectedGroup] = useState<{ name: string; avatarUrl?: string } | null>(authorAs ? { name: 'Loading group...' } : null);
  useEffect(() => {
    if (!authorAs) return;
    let cancelled = false;
    (async () => {
      try {
        const identity = await readGroupIdentity(authorAs);
        if (!cancelled) setSelectedGroup({ name: identity.name || 'Group' });
        const faces = await resolveFaceMedia(async (sql, scope, prepare) => (await getV3Client().query(sql, { groups: scope, prepare })).rows, GROUP_FACE_SQL, [authorAs], 'group_id');
        const face = faces.get(authorAs);
        if (!cancelled) setSelectedGroup({ name: face?.name || identity.name || 'Group', avatarUrl: face?.avatar_url });
      } catch (e) {
        console.warn('[social-composer] draft face unavailable:', e);
        if (!cancelled) setSelectedGroup((current) => current?.name === 'Loading group...' ? { name: 'Group' } : current);
      }
    })();
    return () => { cancelled = true; };
  }, [authorAs, isEditing]);

  // The caption is a Tiptap editor (D85, rich-text.md "The write side"): the
  // user writes in a WYSIWYG (bold, italic, headings, lists, code, links) and
  // the markdown is stored under the hood — `text` is the markdown string,
  // kept in sync via onUpdate. The user never sees the markdown. The editor
  // owns the document; `text` is the serialized form the data layer writes.
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, protocols: ['web10'] } }),
      Placeholder.configure({
        placeholder: repostingTo ? 'Add a comment…' : "What's on your mind?",
      }),
    ],
    // Edit mode: the stored `text` is markdown, but Tiptap seeds from HTML —
    // convert it (the inverse of the turndown write) or the editor would show
    // the raw `**bold**` syntax instead of **bold** (D85, the write side).
    content: markdownToHtml(editingPost?.text ?? draftText ?? ''),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    // The markdown is NOT computed here — a full turndown walk of the document
    // on every keystroke is what made typing laggy. Just track whether there's
    // content (cheap); the markdown is serialized on demand at submit.
    onUpdate: ({ editor }) => {
      setHasText(!editor.isEmpty);
    },
    editorProps: {
      attributes: {
        'data-testid': 'composer-textarea',
        class:
          'composer-editor bg-transparent caret-brand-400 min-h-[180px] max-h-[40vh] overflow-y-auto px-0 py-1 text-lg leading-relaxed text-foreground focus:outline-none',
      },
      // The browser's native Cmd/Ctrl+U underlines a contenteditable selection
      // in place — but the write side (turndown) has no rule for `<u>` and
      // markdown has no underline, so the mark would vanish on save: the editor
      // would show underlined text that posts as plain. The toolbar is the ONLY
      // formatting surface (D85, rich-text.md) and it has no underline button,
      // so the editor must not offer one either. Suppress the native shortcut
      // so the editor never shows a format it cannot persist.
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'u') {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  });

  // Test seam: jsdom can't drive a ProseMirror contenteditable through DOM
  // events (ProseMirror's beforeinput is a no-op stub and its click path needs
  // coordinate APIs jsdom lacks), so tests reach the editor through its command
  // API. Expose the instance on the contenteditable node.
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom as HTMLElement & { __editor?: typeof editor };
    el.__editor = editor;
    return () => {
      el.__editor = undefined;
    };
  }, [editor]);

  // Serialize the editor's document to markdown — called ONLY at submit (not on
  // every keystroke, which is what made typing laggy). The markdown is the true
  // data the data layer writes; the user never sees it.
  const getMarkdown = useCallback(
    () => (editor ? markdownConverter.turndown(editor.getHTML()).trim() : ''),
    [editor],
  );

  // Load the creator's ads + albums when the picker opens (lazy — only when
  // the creator actually pins an ad).
  const openAdPicker = useCallback(async () => {
    setShowAdPicker(true);
    if (!ads.length && !loadingAds) {
      setLoadingAds(true);
      try {
        const { ads: myAds, albums: myAlbums } = await readMyAds();
        setAds(myAds);
        setAlbums(myAlbums);
      } catch (e) {
        console.warn('[social-composer] readMyAds failed:', e);
      } finally {
        setLoadingAds(false);
      }
    }
  }, [ads.length, loadingAds]);

  useEffect(() => {
    readProfile()
      .then(async (p) => {
        setProfile(p);
        if (p?.avatar_ref) {
          const [media] = await resolveMediaRefs([p.avatar_ref]);
          setAvatarUrl(media?.url);
        }
      })
      .catch(() => {});

    readSettings()
      .then((s) => {
        if (!isEditing && !groups && !visibilityTouched.current && s.defaultVisibility === 'private') {
          setVisibility('private');
        }
      })
      .catch(() => {});
  }, []);

  // Edit mode: resolve the post's media refs into displayable records so the
  // remove-only grid can show them. Runs once per post being edited.
  useEffect(() => {
    if (!editingPost) return;
    setRemovedEditMediaIds(new Set());
    const refs = (editingPost.media_refs || []).filter(Boolean) as (string | ResolvedMediaRef)[];
    let cancelled = false;
    if (!refs.length) {
      setEditMedia([]);
      return;
    }
    resolveMediaRefs(refs)
      .then((media) => { if (!cancelled) setEditMedia(media); })
      .catch(() => {
        if (!cancelled) {
          console.warn('[social-composer] edit media preview failed; original refs retained', { refCount: refs.length });
          setEditMedia([]);
        }
      });
    return () => { cancelled = true; };
  }, [editingPost?._id]);

  // Track all preview URLs for cleanup on unmount
  const previewUrlsRef = useRef(new Set<string>());
  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const processAndAddFiles = useCallback(async (selected: FileList | File[]) => {
    const newFiles = Array.from(selected);
    if (!newFiles.length) return;

    const itemsToAdd: AttachedMedia[] = [];
    for (const file of newFiles) {
      const validationError = validateMedia(file);
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);

      if (validationError) {
        itemsToAdd.push({
          id: nextMediaId++,
          file,
          previewUrl,
          isVideo: file.type.startsWith('video/'),
          isAudio: file.type.startsWith('audio/'),
          width: 0,
          height: 0,
          duration: 0,
          altText: '',
          processing: false,
          error: validationError,
        });
        continue;
      }

      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');

      itemsToAdd.push({
        id: nextMediaId++,
        file,
        previewUrl,
        isVideo,
        isAudio,
        width: 0,
        height: 0,
        duration: 0,
        altText: '',
        processing: true,
      });

      // Process in background
      (async () => {
        try {
          if (isAudio) {
            const info = await getAudioInfo(file);
            setMediaItems((prev) =>
              prev.map((item) =>
                item.file === file ? { ...item, duration: info.duration, processing: false } : item,
              ),
            );
          } else if (isVideo) {
            const info = await getVideoInfo(file);
            const durationError = validateVideoDuration(info.duration);
            if (durationError) {
              setMediaItems((prev) =>
                prev.map((item) =>
                  item.file === file ? { ...item, processing: false, error: durationError } : item,
                ),
              );
              return;
            }
            setMediaItems((prev) =>
              prev.map((item) =>
                item.file === file
                  ? { ...item, width: info.width, height: info.height, duration: info.duration, processing: false }
                  : item,
              ),
            );
          } else {
            const processed = await processImage(file);
            const processedFile = new File([processed.blob], file.name, { type: processed.mimeType });
            const newPreviewUrl = URL.createObjectURL(processedFile);
            previewUrlsRef.current.delete(previewUrl);
            previewUrlsRef.current.add(newPreviewUrl);
            setMediaItems((prev) =>
              prev.map((item) =>
                item.file === file
                  ? {
                      ...item,
                      file: processedFile,
                      previewUrl: newPreviewUrl,
                      width: processed.width,
                      height: processed.height,
                      processing: false,
                    }
                  : item,
              ),
            );
          }
        } catch (e) {
          console.error('Media processing error:', e);
          // A VideoMetadataError carries a user-facing message (undecodable
          // codec / corrupt file) — surface it instead of the generic line.
          const message =
            e instanceof Error && e.name === 'VideoMetadataError'
              ? e.message
              : 'Failed to process media. Try a different file.';
          setMediaItems((prev) =>
            prev.map((item) =>
              item.file === file
                ? {
                    ...item,
                    processing: false,
                    error: { field: 'type', message },
                  }
                : item,
            ),
          );
        }
      })();
    }

    setMediaItems((prev) => [...prev, ...itemsToAdd]);
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) processAndAddFiles(e.target.files);
    e.target.value = '';
  }

  // The album-art shortcut (the operator's "paste the album cover in, or drag
  // the album cover on there"): when the tray holds EXACTLY ONE AUDIO item, an
  // incoming image is that track's COVER — it attaches as the track's
  // thumbnail (the audio doc's thumbnail_object_key, the shared album-art
  // precedence's first pick), not as a second media item. Everything else —
  // videos, audio, images into a mixed/multi-item tray — goes through the
  // normal tray path (processAndAddFiles: validation + background processing).
  function routeAttachFiles(files: File[]) {
    if (!files.length) return;
    const soloAudio = mediaItems.length === 1 && mediaItems[0].isAudio ? mediaItems[0] : null;
    const firstImage = files.find(file => file.type.startsWith('image/'));
    if (soloAudio && firstImage) {
      handleAlbumArtChange(soloAudio.id, firstImage);
      const rest = files.filter(file => file !== firstImage);
      if (rest.length) processAndAddFiles(rest);
      return;
    }
    processAndAddFiles(files);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) routeAttachFiles(Array.from(e.dataTransfer.files));
  }

  // Cmd/Ctrl+V with pixels on the clipboard attaches the image(s) to the
  // tray — the same path as the picker button and drag-drop (routeAttachFiles
  // sends a cover to a solo audio track's album art, everything else to the
  // tray). Plain-text pastes return no files: no preventDefault, the editor
  // owns the paste. Edit mode is remove-only (you can't attach new media to
  // an existing post), so a pasted image is left to the editor's default
  // handling (the schema has no image node — it drops, same as before this
  // handler existed).
  function handlePaste(e: React.ClipboardEvent) {
    if (isEditing) return;
    const files = clipboardImageFiles(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    routeAttachFiles(files);
  }

  function removeMedia(id: number) {
    const item = mediaItems.find((m) => m.id === id);
    if (item) {
      previewUrlsRef.current.delete(item.previewUrl);
      if (item.albumArtUrl) URL.revokeObjectURL(item.albumArtUrl);
      if (item.thumbnailUrl) {
        previewUrlsRef.current.delete(item.thumbnailUrl);
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    }
    setMediaItems((prev) => prev.filter((m) => m.id !== id));
  }

  function updateAltText(id: number, alt: string) {
    setMediaItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, altText: alt } : item)),
    );
  }

  function handleAlbumArtChange(id: number, file: File) {
    setMediaItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const url = URL.createObjectURL(file);
        previewUrlsRef.current.add(url);
        if (item.albumArtUrl) URL.revokeObjectURL(item.albumArtUrl);
        return { ...item, albumArt: file, albumArtUrl: url };
      }),
    );
  }

  // The thumbnail picker's apply (video-experience.md "Cover frame pick"):
  // the pick becomes the tray item's poster (the <video> poster attr) and,
  // at post time, the media doc's thumbnail_object_key (uploadMedia's
  // thumbnailFile — the existing seam, zero node surface).
  function handleThumbnailApply(id: number, selection: VideoThumbnailSelection) {
    setMediaItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const url = URL.createObjectURL(selection.blob);
        previewUrlsRef.current.add(url);
        if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
        console.log('[social-composer] thumbnail picked — item:', id, 'time:', selection.time, 'custom:', !!selection.custom);
        return { ...item, thumbnail: selection, thumbnailUrl: url };
      }),
    );
    setThumbnailMediaId(null);
  }

  // The editor's finished file replaces the original — the trimmed/cropped
  // file is what gets uploaded, the node never sees the source.
  const handleVideoEdited = useCallback((id: number, result: VideoEditResult) => {
    setMediaItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const newPreviewUrl = URL.createObjectURL(result.file);
        previewUrlsRef.current.delete(item.previewUrl);
        previewUrlsRef.current.add(newPreviewUrl);
        // A frame pick is a timestamp in the ORIGINAL file — after the
        // re-encode it points at different content, so drop it (the tray
        // falls back to the auto-captured poster). A custom image is the
        // creator's own art: it survives the edit.
        let thumbnailUrl = item.thumbnailUrl;
        let thumbnail = item.thumbnail;
        if (thumbnail && !thumbnail.custom) {
          console.log('[social-composer] video edited — dropping the frame pick (it no longer matches the re-encode)');
          previewUrlsRef.current.delete(thumbnailUrl!);
          URL.revokeObjectURL(thumbnailUrl!);
          thumbnailUrl = undefined;
          thumbnail = undefined;
        }
        console.log('[social-composer] video edited — replacing file, new dims:', result.width, 'x', result.height);
        return {
          ...item,
          file: result.file,
          previewUrl: newPreviewUrl,
          width: result.width,
          height: result.height,
          edited: true,
          thumbnail,
          thumbnailUrl,
        };
      }),
    );
    setEditingMediaId(null);
  }, []);

  /** Patch one tray item by id (used for the encode/upload progress). */
  const patchItem = useCallback((id: number, patch: Partial<AttachedMedia>) => {
    setMediaItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  function handleDragStart(e: React.DragEvent, index: number) {
    const item = mediaItems[index];
    if (item) dragIdRef.current = item.id;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, _index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleMediaDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    const dragId = dragIdRef.current;
    if (dragId === null) return;
    setMediaItems((prev) => {
      const dragIdx = prev.findIndex((m) => m.id === dragId);
      if (dragIdx === -1 || dragIdx === dropIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dropIndex, 0, moved);
      return next;
    });
    dragIdRef.current = null;
  }

  function handleDragEnd() {
    dragIdRef.current = null;
  }

  // Edit mode save (the ONE edit path): write the edited title + body + the
  // surviving media refs + the ad preference back via updatePost. No fan-out
  // (it's not a new post). `onPostCreated` is reused as the "saved" callback —
  // the sheet closes + fires `post-created`, the screens reload and pick up
  // the edit.
  async function handleSaveEdit() {
    if (!editingPost) return;
    const markdown = getMarkdown();
    if (!markdown && !title.trim() && !retainedEditRefs.length) return;
    setError(null);
    setPosting(true);
    setAccessBlocked(false);
    try {
      const updates: Partial<PostRecord> = {
        title: title.trim() || undefined,
        text: markdown,
        updated_at: new Date().toISOString(),
      };
      // Preview resolution is not removal intent: unresolved siblings survive.
      const originalRefs = editingPost.media_refs || [];
      if (retainedEditRefs.length !== originalRefs.length) {
        updates.media_refs = retainedEditRefs;
      }
      const adPreference = pinnedAd
        ? { mode: 'pinned' as const, target: pinnedAd._id }
        : { mode: 'none' as const };
      console.log('[social-composer] saving existing post', { groupAuthor: !!authorAs, mediaChanged: updates.media_refs !== undefined });
      await updatePost(editingPost._id || '', updates, adPreference, editingPost.author_key?.includes('/groups/') ? editingPost.author_key : undefined);
      console.log('[social-composer] post saved (edit)', editingPost._id);
      onPostCreated?.();
    } catch (e) {
      console.error('[social-composer] edit failed; retaining draft', { errorType: e instanceof Error ? e.name : 'unknown' });
      showSubmitError(e);
    } finally {
      setPosting(false);
    }
  }

  async function handleSubmit() {
    const markdown = getMarkdown();
    if (!markdown && !mediaItems.length && !repostingTo) return;
    setError(null);
    setAccessBlocked(false);

    // Repost (reposts.md): a repost is a real post doc referencing the
    // original — no media upload of the user's own (the original's media is
    // referenced by the original post, not copied). The comment rides in text.
    if (repostingTo) {
      setPosting(true);
      try {
        await createRepost(repostingTo, markdown, authorAs, groups);
        // Group reposts never use the human's follower delivery path.
        if (!authorAs) {
          try {
            await fanOutToFollowers({ _id: repostingTo._id, text: markdown || undefined, created_at: new Date().toISOString() });
          } catch (fanOutErr) {
            console.warn('Fan-out to followers failed (non-fatal):', fanOutErr);
          }
        }
        editor?.commands.clearContent();
        setHasText(false);
        setMediaItems([]);
        onRepostCancel?.();
        onPostCreated?.();
      } catch (e) {
        console.error('Failed to create repost:', e);
        showSubmitError(e);
      } finally {
        setPosting(false);
      }
      return;
    }

    // Check for items with errors
    const erroredItems = mediaItems.filter((item) => item.error);
    if (erroredItems.length) {
      setError('Fix the highlighted media issues before posting.');
      return;
    }

    setUploading(true);

    try {
      const mediaRecords: MediaRecord[] = [];

      if (onQueueMediaPost && mediaItems.length) {
        if (mediaItems.some(item => item.processing)) throw new Error('Wait for your media to finish loading before posting.');
        const human = getWapi()?.readToken();
        if (!human || !draftHuman || human.provider !== draftHuman.provider || human.username !== draftHuman.username) {
          throw new Error('The account changed. Reopen the composer under the intended account before posting.');
        }
        // Hand off immutable draft values, never the composer's temporary URLs.
        // This does not report a published post or fire post-created events.
        console.log('[social-composer] media queue handoff started', { files: mediaItems.length });
        const accepted = await onQueueMediaPost({
          title: title.trim(), text: markdown, visibility,
          authorAs: authorAs || undefined,
          authorLabel: selectedGroup?.name || profile?.display_name || 'You',
          groups: groups ? [...groups] : undefined,
          pinnedAdId: pinnedAd?._id,
          markAsMusic,
          media: mediaItems.map(item => ({
            file: item.file, width: item.width, height: item.height, duration: item.duration,
            altText: item.altText, edited: item.edited, albumArt: item.albumArt,
            // The creator's thumbnail pick (a captured frame or their own
            // image) — the queue transport cannot carry it yet, so a picked
            // draft takes the standard path (the pick is never silently
            // dropped; the follow-up lane item extends the multipart confirm).
            thumbnail: item.thumbnail ? new File([item.thumbnail.blob], `poster-${item.id}.webp`, { type: item.thumbnail.mimeType }) : undefined,
          })),
        });
        if (accepted !== false) {
          console.log('[social-composer] media queue handoff accepted');
          return;
        }
      }

      const mediaService = visibility === 'public' ? 'public_media' : 'media';
      const uploader = getWapi()?.readToken();
      const uploadScope = uploader ? JSON.stringify([API_ORIGIN, uploader.provider, uploader.username, mediaService]) : null;

      for (const item of mediaItems) {
        const completed = completedUploads.current.get(item.id);
        if (uploadScope && completed?.scope === uploadScope && completed.file === item.file
          && completed.altText === item.altText && completed.albumArt === item.albumArt && completed.thumbnail === item.thumbnail) {
          console.log('[social-composer] retry reuses completed upload');
          mediaRecords.push(completed.record);
          continue;
        }
        let record: MediaRecord;

        if (item.isAudio) {
          // Audio: no transcode (the node's ffmpeg is for video HLS), no
          // poster frame. The album art (if the user picked one) becomes the
          // track's thumbnail — the Music wall's cover.
          let albumArtFile: File | undefined;
          if (item.albumArt) {
            const thumb = await generateThumbnail(item.albumArt);
            albumArtFile = new File([thumb.blob], `album-art-${Date.now()}.webp`, { type: thumb.mimeType });
          }

          record = await uploadMedia({
            file: item.file,
            thumbnailFile: albumArtFile,
            durationSeconds: Math.round(item.duration * 100) / 100,
            altText: item.altText || undefined,
            service: mediaService,
            onProgress: (p) => patchItem(item.id, { postPhase: 'uploading', postProgress: p }),
          });
        } else if (item.isVideo) {
          // The node transcodes every upload to HLS. A video the user ran
          // through the editor is already the finished re-encode; one they
          // never touched gets the DEFAULT edit (Original ratio, full
          // duration) right here.
          //
          // The default edit is a NO-OP (no trim, no crop) — the common case.
          // The `canvas.captureStream` + `MediaRecorder` re-encode is a
          // real-time capture: it plays the source and records each frame +
          // the audio in wall-clock time, and when the main thread stutters
          // the audio capture distorts (the "Darth Vader" pitch effect). A
          // no-op edit re-encodes nothing, so we skip the lossy real-time
          // path and upload the original file directly — the node's ffmpeg is
          // the deterministic transcode, not the browser's real-time capture.
          // (An unedited item is always a no-op: the editor is the only place
          // a trim/crop is set, and that marks the item `edited`.)
          let fileToUpload = item.file;
          let info = await getVideoInfo(item.file);
          if (!item.edited && !isNoopEdit({}, info.duration)) {
            // A real default edit (defensive — an unedited item is a no-op;
            // this only runs if a future caller sets a trim/crop without
            // marking `edited`). Re-encode through the editor path.
            console.log('[social-composer] video default edit (trim/crop) — re-encoding:', item.file.name);
            patchItem(item.id, { postPhase: 'encoding', postProgress: 0 });
            const result = await editVideo(item.file, {
              onProgress: (f) => patchItem(item.id, { postProgress: f }),
            });
            fileToUpload = new File(
              [result.blob],
              `${item.file.name.replace(/\.[^.]+$/, '') || 'video'}-upload.webm`,
              { type: result.mimeType },
            );
            info = await getVideoInfo(fileToUpload);
            console.log(
              '[social-composer] default encode done —',
              result.width,
              'x',
              result.height,
              fileToUpload.size,
              'bytes',
            );
          } else if (!item.edited) {
            console.log('[social-composer] video not edited — no-op edit, uploading original (no re-encode):', item.file.name);
          }

          // The poster: the creator's pick if they made one (the thumbnail
          // picker — a captured frame or their own image), else the auto-
          // captured 25% frame (the pre-picker behavior; a user who never
          // opens the picker gets exactly what they got before).
          let posterFile: File;
          if (item.thumbnail) {
            const ext = item.thumbnail.mimeType === 'image/jpeg' ? 'jpg' : 'webp';
            posterFile = new File([item.thumbnail.blob], `poster-${item.id}-${Date.now()}.${ext}`, { type: item.thumbnail.mimeType });
            console.log(
              '[social-composer] video poster — creator pick',
              item.thumbnail.custom ? '(own image)' : `(${item.thumbnail.time}s frame)`,
            );
          } else {
            const poster = await captureVideoPoster(fileToUpload);
            posterFile = new File([poster.blob], `poster-${Date.now()}.webp`, { type: poster.mimeType });
            console.log('[social-composer] video poster — auto capture (no pick yet)');
          }

          record = await uploadMedia({
            file: fileToUpload,
            thumbnailFile: posterFile,
            width: info.width,
            height: info.height,
            durationSeconds: Math.round(info.duration * 100) / 100,
            altText: item.altText || undefined,
            service: mediaService,
            onProgress: (p) => patchItem(item.id, { postPhase: 'uploading', postProgress: p }),
          });
        } else {
          // Generate thumbnail for images
          const thumb = await generateThumbnail(item.file);
          const thumbFile = new File([thumb.blob], `thumb-${Date.now()}.webp`, { type: thumb.mimeType });

          record = await uploadMedia({
            file: item.file,
            thumbnailFile: thumbFile,
            width: item.width,
            height: item.height,
            altText: item.altText || undefined,
            service: mediaService,
          });
        }

        if (record._id) {
          mediaRecords.push(record);
          if (uploadScope) completedUploads.current.set(item.id, {
            scope: uploadScope, file: item.file, altText: item.altText,
            albumArt: item.albumArt, thumbnail: item.thumbnail, record,
          });
        }
      }

      setPosting(true);
      // A short (shorts.md): exactly one video, 9:16 (width < height). The
      // creator already signaled it by shooting/cropping vertical — auto-detect,
      // no toggle. The tag is the server-side feed filter; the Shorts feed also
      // re-derives 9:16 at render (the tag alone is client-asserted).
      const isShort =
        mediaItems.length === 1 &&
        mediaItems[0].isVideo &&
        mediaItems[0].width > 0 &&
        mediaItems[0].height > 0 &&
        mediaItems[0].width < mediaItems[0].height;
      // A music track (music.md): exactly one audio file. Auto-detect, no
      // toggle — the tag is the server-side feed filter; the Music feed also
      // re-derives audio/* at render (the tag alone is client-asserted).
      const isMusic = mediaItems.length === 1 && mediaItems[0].isAudio;
      // The "mark as music" toggle: a video (or any media) the user explicitly
      // flagged as music. A video CAN be music — this is opt-in, never
      // automatic. The same `music` tag puts the post in the Music tab.
      const hasVideo = mediaItems.some((m) => m.isVideo);
      const isMarkedMusic = markAsMusic && hasVideo;
      // Keep explicit destinations; otherwise use the group's memberships.
      let targetGroups: string[] | undefined = groups;
      if (authorAs) {
        targetGroups = groups || await actingPostGroups(authorAs);
      }
      // Explicit destinations retain their audience unless the author opts in
      // to Discover. A body visibility field alone does not enforce access.
      if (targetGroups && (authorAs || groups)) {
        if (!targetGroups.length) throw new Error('Choose a destination before posting.');
        const discover = getDiscoverGroupId();
        targetGroups = visibility === 'private'
          ? targetGroups.filter((group) => group !== discover)
          : [...new Set([...targetGroups, discover])];
        if (!targetGroups.length) throw new Error('Choose a destination before posting.');
        console.log('[social-composer] audience resolved', { public: visibility === 'public', destinations: targetGroups.length });
      }

      const postRecord = await createPost(
        {
          title: title.trim() || undefined,
          text: markdown,
          media_refs: mediaRecords.map((m) => m._id!).filter(Boolean),
          visibility,
          created_at: new Date().toISOString(),
          tags: isShort ? ['short'] : isMusic ? ['music'] : isMarkedMusic ? ['music'] : undefined,
        },
        targetGroups,
        pinnedAd ? { mode: 'pinned', target: pinnedAd._id } : undefined,
        authorAs || undefined,
      );

      // Fan-out to followers' inboxes (public posts only)
      if (visibility === 'public' && !authorAs) {
        try {
          await fanOutToFollowers(postRecord);
        } catch (fanOutErr) {
          console.warn('Fan-out to followers failed (non-fatal):', fanOutErr);
        }
      }

      mediaItems.forEach((item) => previewUrlsRef.current.delete(item.previewUrl));
      previewUrlsRef.current.clear();
      setTitle('');
      editor?.commands.clearContent();
      setHasText(false);
      setMediaItems([]);
      setPinnedAd(null);
      completedUploads.current.clear();
      onPostCreated?.();
    } catch (e) {
      console.error('Failed to create post:', e);
      // Drop the in-flight phase so the tray returns to a retryable state
      // (a stuck "Uploading 45%" spinner would read as still working).
      setMediaItems((prev) => prev.map((item) => (item.postPhase ? { ...item, postPhase: undefined, postProgress: undefined } : item)));
      showSubmitError(e);
    } finally {
      setUploading(false);
      setPosting(false);
    }
  }

  // A plain repost (no comment, no media) is valid — the repost itself is the
  // content. Otherwise the post needs text or media. In edit mode, a save is
  // valid as long as the post still has some content (text / title / media).
  const canPost = isEditing
    ? (hasText || title.trim() || retainedEditRefs.length) && !posting && !audienceBusy
    : (hasText || title.trim() || mediaItems.length || !!repostingTo) && !uploading && !posting;
  const hasErroredMedia = mediaItems.some((item) => item.error);
  const initials = (profile?.display_name || '?').charAt(0).toUpperCase();
  // The account the post is being created AS (the identity row). Read from the
  // wapi token — the signed-in user's username. Shown as `@handle` under the
  // name so it's clear who the post is from (and it generalizes to a group /
  // alternate identity later).
  const currentUsername = getWapi()?.readToken()?.username || '';

  // Compact mode: the composer rests as a single-line bar and expands to the
  // full form when it has focus or content (the Discover surface — the video
  // wall is the hero, not the composer). The full form is always shown for a
  // repost (the context block must be visible) or when not compact.
  const hasContent = hasText || title.trim().length > 0 || mediaItems.length > 0 || retainedEditRefs.length > 0;
  const expanded = !compact || focused || hasContent || !!repostingTo || isEditing;

  return (
    <div
      className={cn(
        'relative overflow-hidden transition-all duration-150',
        chromeless ? 'px-4 py-4 sm:px-6 sm:py-5' : 'px-4 py-4 border-b border-border',
        dragOver && 'bg-brand-muted/30',
        focused && !chromeless && 'border-b-brand/30',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      data-testid="post-composer"
    >
      {focused && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent"
          aria-hidden="true"
        />
      )}
      {/* Identity row: the avatar + the name (the Facebook structure — the
          avatar + name anchor the top, and everything below shares one left
          margin, so the title, caption, toolbar, action bar, and Post button
          all line up to the same edge — the "neat vertical stacking"). The
          name makes it clear who the post is being created AS — the account
          identity, which will matter once a post can be made as a group /
          alternate profile. */}
      <div className="mb-3 flex items-center gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          {selectedGroup?.avatarUrl ? (
            <AvatarImage src={selectedGroup.avatarUrl} alt="" />
          ) : !selectedGroup && avatarUrl ? (
            <AvatarImage src={avatarUrl} alt="" />
          ) : (
            <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
              {selectedGroup ? (selectedGroup.name.charAt(0).toUpperCase()) : initials}
            </AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.9375rem] font-semibold text-foreground" data-testid="composer-author-name">
            {selectedGroup ? selectedGroup.name : (profile?.display_name || 'You')}
          </p>
          {selectedGroup ? (
            <p className="truncate text-xs text-muted-foreground" data-testid="composer-author-handle">
              Group
            </p>
          ) : currentUsername ? (
            <p className="truncate text-xs text-muted-foreground" data-testid="composer-author-handle">
              @{currentUsername}
            </p>
          ) : null}
        </div>
      </div>

      <div>
          {repostingTo && (
            <RepostContext
              post={repostingTo}
              onCancel={() => {
                editor?.commands.clearContent();
                setHasText(false);
                setMediaItems([]);
                onRepostCancel?.();
              }}
            />
          )}
           {/* The title — the post's headline (D82). A single-line input above
               the caption; optional (a post with no title is caption-only) —
               the placeholder says so, so the optionality is explicit (the
               operator, 30.09.2026: "it isnt soo so clear that titles are
               optional"). Hidden in repost mode (the text there is the
               repost's comment). The D85 title treatment (rich-text.md): a
               headline you are writing, not a form field — the display face
               (Space Grotesk), the `bg-elevated` box killed (it sits on the
               composer surface), a violet caret (the brand moment), and a
               dimmed display-face placeholder so the empty state looks like a
               headline waiting to be written. The composer's focus glow (the
               top brand line) is the "the stage is lit" moment. */}
           {!repostingTo && (
             <Input
               value={title}
               onChange={(e) => setTitle(e.target.value)}
               onFocus={() => setFocused(true)}
               placeholder="Add a title (optional)…"
               disabled={posting}
              className="mb-1.5 h-auto min-h-9 rounded-none border-0 bg-transparent px-0 py-1 font-display text-2xl font-semibold tracking-tight text-foreground caret-brand-400 placeholder:font-display placeholder:text-muted-foreground/50"
              aria-label="Post title"
              data-testid="composer-title"
            />
          )}
           {/* The caption — the Tiptap editor (WYSIWYG). The markdown is stored
               under the hood (serialized on demand at submit — NOT on every
               keystroke, which is what made typing laggy); the user never sees
               the syntax. The contenteditable carries the testid + the
               on-surface classes (bg-transparent, the violet caret). The
               formatting toolbar lives below the text (a row above the action
               bar — the Facebook structure), not above it. */}
          <EditorContent editor={editor} />
          {editor && <EditorMentions editor={editor} scope={`caption:${editingPost?._id || 'new'}:${authorAs || ''}`} />}
          <p className="mt-2 text-xs text-muted-foreground">Tag someone with @username</p>

          {expanded && (
            <>
              {dragOver && (
                <div className="mt-2 rounded border-2 border-dashed border-brand text-center py-4 text-sm text-brand-300">
                  Drop to attach
                </div>
              )}

              {mediaItems.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2" data-testid="media-tray">
                  {mediaItems.map((item, i) => (
                    <MediaTrayItem
                      key={item.id}
                      item={item}
                      index={i}
                      count={mediaItems.length}
                      onRemove={() => removeMedia(item.id)}
                      onAltTextChange={(alt) => updateAltText(item.id, alt)}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleMediaDrop}
                      onDragEnd={handleDragEnd}
                      onEdit={item.isVideo ? () => setEditingMediaId(item.id) : undefined}
                      onThumbnail={item.isVideo ? () => setThumbnailMediaId(item.id) : undefined}
                      onAlbumArtChange={item.isAudio ? (f) => handleAlbumArtChange(item.id, f) : undefined}
                      disabled={posting || uploading}
                    />
                  ))}
                </div>
              )}

              {/* The "mark as music" toggle (music.md): opt-in, shown when the
                  post has video media. A video CAN be music — checking this
                  sets the same `music` tag the audio flow sets, so the post
                  appears in the Music tab and the author's profile Music
                  section. No audio file, album art, or metadata required. */}
              {mediaItems.some((m) => m.isVideo) && !isEditing && (
                <label className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface p-3 cursor-pointer select-none" data-testid="mark-as-music-toggle">
                  <input
                    type="checkbox"
                    checked={markAsMusic}
                    onChange={(e) => setMarkAsMusic(e.target.checked)}
                    disabled={posting || uploading}
                    className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    aria-label="Mark as music"
                  />
                  <Music className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                  <span className="text-sm text-foreground">Mark as music</span>
                  <span className="text-xs text-muted-foreground ml-auto">Appears in the Music tab</span>
                </label>
              )}

              {/* The "mark as music" toggle in edit mode (music.md): shown when
                  the post has video OR audio media — a video CAN be music
                  (opt-in), and an audio post's auto-set `music` tag can be
                  REMOVED here (the choice, both directions). Saves separately
                  from post content (like the Discover audience control) —
                  toggling writes the tag via updatePost. */}
              {isEditing && editMedia.some((m) => m.mime_type?.startsWith('video/') || m.mime_type?.startsWith('audio/')) && (
                <section className="rounded-lg border border-border bg-surface p-3 space-y-2" aria-label="Mark as music" data-testid="edit-mark-as-music">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                    <p className="text-sm font-medium">Mark as music</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Appears in the Music tab and the author's profile Music section. This saves separately from post content.</p>
                  <MusicTagToggle
                    docId={editingPost._id || ''}
                    initialTags={editingPost.tags || []}
                    authorAs={authorAs || undefined}
                    disabled={posting}
                    onBusyChange={setAudienceBusy}
                  />
                </section>
              )}

              {/* Edit mode: the post's current media, remove-only (you can't
                  attach new media to an existing post). Each item has a remove
                  button; the survivors are written back on save. */}
              {editingPost?._id && <DiscoverAudience docId={editingPost._id} authorAs={authorAs || undefined} disabled={posting} onBusyChange={setAudienceBusy} />}
              {isEditing && editMedia.length > 0 && (
                <div className="mt-3" data-testid="edit-media-grid">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Media — tap × to remove</p>
                  <div className="grid grid-cols-3 gap-2">
                    {editMedia.map((m, i) => (
                      <div key={m._id || i} className="relative aspect-square overflow-hidden rounded-lg bg-elevated">
                        {m.mime_type?.startsWith('video/') ? (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Film className="w-6 h-6" />
                          </div>
                        ) : (
                          <ReliableImage
                            src={m.thumbnail_url || m.url}
                            alt={m.alt_text || ''}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const id = m._id;
                            if (!id) return;
                            setRemovedEditMediaIds((prev) => new Set([...prev, id]));
                            setEditMedia((prev) => prev.filter((x) => x._id !== id));
                          }}
                          disabled={posting}
                          aria-label="Remove media"
                          data-testid={`composer-edit-remove-media-${i}`}
                          className="absolute -top-2 -right-2 flex items-center justify-center h-7 w-7 rounded-full bg-background border border-border shadow-md text-muted-foreground hover:text-danger hover:border-danger transition-colors disabled:opacity-40"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && accessBlocked && <AccessRecovery error={error} onRetry={() => { void (isEditing ? handleSaveEdit() : handleSubmit()); }} />}
              {error && !accessBlocked && (
                <div className="mt-3 flex items-center gap-2 text-sm text-danger" role="alert" data-testid="composer-error">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* The formatting toolbar (the "Aa" controls — the D85 write side,
                  rich-text.md "The write side"): a slim token/Lucide row that
                  wraps the selection / toggles a block. No block inspector (the
                  WordPress foot-gun, rejected). It sits at the bottom, a row
                  above the action bar (the Facebook structure), not in the
                  middle of the text. The user controls the markdown here —
                  bold, italic, heading, list, code, link — and never sees the
                  syntax. */}
              <div className="mt-3 flex items-center gap-1" data-testid="composer-toolbar">
                {[
                  { icon: Bold, label: 'Bold', run: () => editor?.chain().focus().toggleBold().run(), on: () => editor?.isActive('bold') },
                  { icon: Italic, label: 'Italic', run: () => editor?.chain().focus().toggleItalic().run(), on: () => editor?.isActive('italic') },
                  { icon: Strikethrough, label: 'Strikethrough', run: () => editor?.chain().focus().toggleStrike().run(), on: () => editor?.isActive('strike') },
                  { icon: Heading2, label: 'Heading', run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), on: () => editor?.isActive('heading', { level: 2 }) },
                  { icon: List, label: 'Bullet list', run: () => editor?.chain().focus().toggleBulletList().run(), on: () => editor?.isActive('bulletList') },
                  { icon: Code, label: 'Code', run: () => editor?.chain().focus().toggleCode().run(), on: () => editor?.isActive('code') },
                  { icon: LinkIcon, label: 'Link', run: () => editor?.chain().focus().extendMarkRange('link').setLink({ href: 'https://' }).run(), on: () => editor?.isActive('link') },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    aria-label={item.label}
                    aria-pressed={!!item.on()}
                    data-testid={`composer-toolbar-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={item.run}
                    disabled={!editor || posting}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-150 disabled:opacity-40',
                      item.on()
                        ? 'bg-brand-muted text-brand-300'
                        : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                    )}
                  >
                    <item.icon className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                ))}
              </div>

          <div className="mt-4 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-1">
              {/* Attach media is create-only — you can't add new media to an
                  existing post in edit mode (media is remove-only there). */}
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:text-brand hover:bg-brand-muted/50 transition-colors duration-150"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || posting}
                  aria-label="Attach media"
                  title="Add media — photos, videos or MP3"
                  data-testid="attach-media-button"
                >
                  <Paperclip className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </Button>
              )}

              {!isEditing && !repostingTo && <div className="relative">
                <select
                  value={visibility}
                  onChange={(e) => { visibilityTouched.current = true; setVisibility(e.target.value as Visibility); }}
                  disabled={posting || uploading}
                  aria-label="Post visibility"
                  data-testid="visibility-selector"
                  className="h-10 rounded text-xs font-medium bg-transparent px-2.5 py-2 text-muted-foreground hover:text-foreground hover:bg-elevated border border-transparent hover:border-border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer pr-7"
                >
                  <option value="public">{authorAs || groups ? 'Public + Discover' : 'Public'}</option>
                  <option value="private">{authorAs || groups ? 'Group audience only' : 'Private'}</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center">
                  {visibility === 'public' ? (
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              </div>}

              {!isEditing && <span className="px-2 text-xs text-muted-foreground" data-testid="composer-acting-identity">Draft as {selectedGroup?.name || currentUsername || 'You'}</span>}

              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-10 w-10 transition-colors duration-150',
                  pinnedAd
                    ? 'text-brand hover:text-brand hover:bg-brand-muted/50'
                    : 'text-muted-foreground hover:text-brand hover:bg-brand-muted/50',
                )}
                onClick={openAdPicker}
                disabled={posting}
                aria-label="Pin an ad"
                data-testid="pin-ad-button"
              >
                <Megaphone className="w-[18px] h-[18px]" strokeWidth={1.75} />
              </Button>
              {pinnedAd && (
                <span
                  className="flex items-center gap-1.5 max-w-40 rounded-full bg-brand-muted px-3 py-1 text-xs text-brand-300"
                  data-testid="pinned-ad-chip"
                >
                  <span className="truncate">{pinnedAd.text || 'Untitled ad'}</span>
                  <button
                    type="button"
                    onClick={() => setPinnedAd(null)}
                    disabled={posting}
                    aria-label="Remove pinned ad"
                    className="shrink-0 hover:text-foreground transition-colors"
                    data-testid="pinned-ad-remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              {uploading && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                  Uploading…
                </span>
              )}
              {hasErroredMedia && (
                <span className="flex items-center gap-1 text-xs text-danger">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {mediaItems.filter((i) => i.error).length} issue{mediaItems.filter((i) => i.error).length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
           <Button
             variant="brand"
             size="default"
             disabled={!canPost || hasErroredMedia}
             onClick={isEditing ? handleSaveEdit : handleSubmit}
             data-testid="post-submit"
             className="mt-3 h-11 w-full font-semibold"
           >
              {posting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isEditing ? 'Saving…' : repostingTo ? 'Reposting…' : 'Posting…'}
                </>
              ) : (
                <>
                  {isEditing
                    ? 'Save'
                    : repostingTo
                      ? <><Repeat2 className="w-3.5 h-3.5" strokeWidth={2} /> Repost</>
                      : authorAs
                        ? <><Send className="w-3.5 h-3.5" /> Post as {selectedGroup?.name || 'Group'}</>
                        : <><Send className="w-3.5 h-3.5" /> Post</>}
                </>
              )}
           </Button>
          </>
          )}
        </div>

      <AdPicker
        open={showAdPicker}
        ads={ads}
        albums={albums}
        selectedAdId={pinnedAd?._id}
        loading={loadingAds}
        onClose={() => setShowAdPicker(false)}
        onSelect={(ad) => {
          setPinnedAd(ad);
          setShowAdPicker(false);
        }}
        onClear={() => {
          setPinnedAd(null);
          setShowAdPicker(false);
        }}
      />

      <VideoEditorSheet
        open={editingMediaId !== null}
        file={mediaItems.find((m) => m.id === editingMediaId)?.file ?? null}
        onClose={() => setEditingMediaId(null)}
        onEdited={(result) => {
          if (editingMediaId !== null) handleVideoEdited(editingMediaId, result);
        }}
      />

      <VideoThumbnailSheet
        open={thumbnailMediaId !== null}
        item={(() => {
          const target = mediaItems.find((m) => m.id === thumbnailMediaId);
          return target?.isVideo
            ? { id: target.id, file: target.file, duration: target.duration, thumbnail: target.thumbnail }
            : null;
        })()}
        onClose={() => setThumbnailMediaId(null)}
        onApply={(selection) => {
          if (thumbnailMediaId !== null) handleThumbnailApply(thumbnailMediaId, selection);
        }}
      />
    </div>
  );
}
