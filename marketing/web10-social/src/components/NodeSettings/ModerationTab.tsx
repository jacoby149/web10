import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Loader2, Ban, EyeOff, ShieldAlert, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast, errorMessage } from '@/components/shared/Toast';
import { getNodeConfig } from '@/data/ads-catalog';
import {
  readModerationFlags,
  setUserAutoHidden,
  saveModerationConfig,
  readHiddenPosts,
  unhidePostFromBoard,
  setUserBanned,
  getBannedUsers,
  type ModerationFlag,
  type HiddenPost,
} from '@/data/moderation';

/**
 * The Moderation tab — the sensitive-words filter + the review queue, ported
 * from the authenticator's Node Config "Content Moderation" card (D59). The
 * operator curates the blocklist, toggles auto-hide, reviews flagged users,
 * and manages the hidden-posts restore list + the node-level ban list.
 *
 * Node_config fields (the node merges these over the existing config):
 *   - moderation_enabled  — master switch (off = no detection runs)
 *   - auto_moderate       — auto-hide matching posts from Discover
 *   - sensitive_words     — the blocklist (whole-word, case-insensitive)
 *   - auto_hide_users     — the "hidden" users (their board docs are swept)
 *   - banned_users        — the node-level ban (content filtered from reads)
 */
export function ModerationTab() {
  const [enabled, setEnabled] = useState(true);
  const [autoModerate, setAutoModerate] = useState(true);
  const [words, setWords] = useState<string[]>([]);
  const [hiddenUsers, setHiddenUsers] = useState<string[]>([]);
  const [bannedUsers, setBannedUsers] = useState<string[]>([]);
  const [newWord, setNewWord] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [flags, setFlags] = useState<ModerationFlag[] | null>(null);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const [hidingUser, setHidingUser] = useState<string | null>(null);
  const [banningUser, setBanningUser] = useState<string | null>(null);

  // The hidden-posts restore list (the discover group's group_hidden_docs).
  const [hiddenPosts, setHiddenPosts] = useState<HiddenPost[] | null>(null);
  const [hiddenPostsLoading, setHiddenPostsLoading] = useState(true);
  const [unhidingPost, setUnhidingPost] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = (await getNodeConfig()) as Record<string, unknown>;
      setEnabled(Boolean(cfg.moderation_enabled ?? true));
      setAutoModerate(Boolean(cfg.auto_moderate ?? true));
      setWords(Array.isArray(cfg.sensitive_words) ? (cfg.sensitive_words as string[]) : []);
      setHiddenUsers(Array.isArray(cfg.auto_hide_users) ? (cfg.auto_hide_users as string[]) : []);
      setBannedUsers(await getBannedUsers());
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to load the moderation settings'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFlags = useCallback(async () => {
    setFlagsLoading(true);
    setFlagsError(null);
    try {
      setFlags(await readModerationFlags());
    } catch (e) {
      setFlagsError(errorMessage(e, 'Failed to load the moderation queue'));
    } finally {
      setFlagsLoading(false);
    }
  }, []);

  const loadHiddenPosts = useCallback(async () => {
    setHiddenPostsLoading(true);
    try {
      setHiddenPosts(await readHiddenPosts());
    } catch {
      // Degrade — the restore list is a convenience; a read failure leaves it
      // empty rather than erroring the whole tab.
      setHiddenPosts([]);
    } finally {
      setHiddenPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadFlags();
    loadHiddenPosts();
  }, [load, loadFlags, loadHiddenPosts]);

  const saveConfig = async (update: {
    moderation_enabled?: boolean;
    auto_moderate?: boolean;
    sensitive_words?: string[];
  }) => {
    setSaving(true);
    try {
      await saveModerationConfig(update);
      toast.success('Moderation settings saved');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to save the moderation settings'));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    saveConfig({ moderation_enabled: next });
  };

  const toggleAutoModerate = () => {
    const next = !autoModerate;
    setAutoModerate(next);
    saveConfig({ auto_moderate: next });
  };

  const addWord = () => {
    const word = newWord.trim().toLowerCase();
    if (!word || words.includes(word)) return;
    const next = [...words, word];
    setWords(next);
    setNewWord('');
    saveConfig({ sensitive_words: next });
  };

  const removeWord = (word: string) => {
    const next = words.filter((w) => w !== word);
    setWords(next);
    saveConfig({ sensitive_words: next });
  };

  // "Keep hiding" / "Unhide" — adds or removes a username from auto_hide_users
  // (a direct action, not a config save). Retroactive (D59a): the node also
  // sweeps the user's existing discover-board docs, so refresh the hidden-posts
  // list after the action.
  const toggleAutoHide = async (username: string) => {
    const hide = !hiddenUsers.includes(username);
    setHidingUser(username);
    setFlagsError(null);
    try {
      const next = await setUserAutoHidden(username, hide);
      setHiddenUsers(next);
      toast.success(hide ? `Hiding @${username} from Discover` : `Restored @${username} to Discover`);
      loadHiddenPosts();
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to update the hidden list'));
    } finally {
      setHidingUser(null);
    }
  };

  // "Ban" / "Unban" — adds or removes a username from banned_users (the
  // node-level ban, D59a). A banned user's content is filtered out of every
  // read path.
  const toggleBan = async (username: string) => {
    const ban = !bannedUsers.includes(username);
    setBanningUser(username);
    setFlagsError(null);
    try {
      const next = await setUserBanned(username, ban);
      setBannedUsers(next);
      toast.success(ban ? `Banned @${username}` : `Unbanned @${username}`);
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to update the ban list'));
    } finally {
      setBanningUser(null);
    }
  };

  // Restore a hidden post to the board (the per-post Unhide in the restore list).
  const unhidePost = async (docId: string) => {
    setUnhidingPost(docId);
    try {
      await unhidePostFromBoard(docId);
      setHiddenPosts((prev) => (prev ? prev.filter((p) => p.doc_id !== docId) : prev));
      toast.success('Post restored to Discover');
    } catch (e) {
      toast.error(errorMessage(e, 'Failed to restore the post'));
    } finally {
      setUnhidingPost(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" data-testid="moderation-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="moderation-tab">
      <p className="text-xs text-muted-foreground">
        Automatic sensitive-language detection on the public board. A post whose
        text trips the blocklist is hidden from Discover and its author is added
        to the review queue. The author&apos;s own copy and their followers&apos; feed
        are untouched — this is board curation, not a ban.
      </p>

      {/* Master switch + auto-hide toggle */}
      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        <ToggleRow
          label="Moderation enabled"
          description="Master switch. Off = no detection runs at all."
          checked={enabled}
          onChange={toggleEnabled}
          disabled={saving}
          testId="moderation-enabled"
        />
        <ToggleRow
          label="Auto-hide on match"
          description="When on, a matching post is hidden from Discover immediately. When off, it is only flagged for review."
          checked={autoModerate}
          onChange={toggleAutoModerate}
          disabled={saving}
          testId="moderation-auto"
        />
      </div>

      {/* The blocklist */}
      <div className="space-y-2">
        <Label className="text-muted-foreground">Sensitive words</Label>
        <p className="text-xs text-muted-foreground">
          Whole-word, case-insensitive. Add or remove words — changes apply on the
          next post. An empty list turns detection off.
        </p>
        <div className="flex gap-2">
          <Input
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addWord()}
            placeholder="add a word"
            aria-label="Add a word to the blocklist"
            data-testid="moderation-word-input"
          />
          <Button onClick={addWord} disabled={saving || !newWord.trim()} data-testid="moderation-word-add">
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
            Add
          </Button>
        </div>
        {words.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="moderation-words-empty">
            Blocklist is empty — detection is off.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5" data-testid="moderation-words">
            {words.map((word) => (
              <span
                key={word}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2.5 py-1 font-mono text-xs text-foreground"
                data-testid={`moderation-word-${word}`}
              >
                {word}
                <button
                  type="button"
                  onClick={() => removeWord(word)}
                  aria-label={`Remove ${word} from the blocklist`}
                  className="text-muted-foreground transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`moderation-word-remove-${word}`}
                >
                  <X className="h-3 w-3" strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* The currently-hidden users (auto_hide_users) */}
      {hiddenUsers.length > 0 && (
        <div className="space-y-2">
          <Label className="text-muted-foreground">Hidden from Discover</Label>
          <p className="text-xs text-muted-foreground">
            These users&apos; board posts are hidden (retroactively). Unhide to restore
            their discover visibility.
          </p>
          <div className="flex flex-wrap gap-1.5" data-testid="moderation-hidden-users">
            {hiddenUsers.map((username) => (
              <span
                key={username}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2.5 py-1 font-mono text-xs text-foreground"
                data-testid={`moderation-hidden-user-${username}`}
              >
                @{username}
                <button
                  type="button"
                  onClick={() => toggleAutoHide(username)}
                  disabled={hidingUser === username}
                  aria-label={`Unhide ${username}`}
                  className="text-muted-foreground transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`moderation-unhide-user-${username}`}
                >
                  {hidingUser === username ? (
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                  ) : (
                    <X className="h-3 w-3" strokeWidth={2} />
                  )}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* The banned users (banned_users — the node-level ban, D59a) */}
      {bannedUsers.length > 0 && (
        <div className="space-y-2">
          <Label className="text-muted-foreground">Banned</Label>
          <p className="text-xs text-muted-foreground">
            Banned users&apos; content is filtered out of every read on this node
            (the board, the feed, the query engine). Unban to restore it.
          </p>
          <div className="flex flex-wrap gap-1.5" data-testid="moderation-banned-users">
            {bannedUsers.map((username) => (
              <span
                key={username}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-danger-muted px-2.5 py-1 font-mono text-xs text-danger"
                data-testid={`moderation-banned-user-${username}`}
              >
                <UserX className="h-3 w-3" strokeWidth={2} />
                @{username}
                <button
                  type="button"
                  onClick={() => toggleBan(username)}
                  disabled={banningUser === username}
                  aria-label={`Unban ${username}`}
                  className="text-danger/70 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`moderation-unban-user-${username}`}
                >
                  {banningUser === username ? (
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                  ) : (
                    <X className="h-3 w-3" strokeWidth={2} />
                  )}
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* The hidden posts (the discover group's takedown list — restore list) */}
      <div className="space-y-2">
        <Label className="text-muted-foreground">Hidden posts</Label>
        <p className="text-xs text-muted-foreground">
          Posts taken off the Discover board (by you or the auto-filter). Restore
          one to put it back on the board.
        </p>
        {hiddenPostsLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : hiddenPosts && hiddenPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="moderation-hidden-posts-empty">
            No hidden posts.
          </p>
        ) : (
          <div className="space-y-1.5" data-testid="moderation-hidden-posts">
            {hiddenPosts?.map((post) => (
              <div
                key={post.doc_id}
                className="flex items-center justify-between gap-2 rounded-sm border border-border bg-elevated px-3 py-2"
                data-testid={`moderation-hidden-post-${post.doc_id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {(post.body?.text as string) || <span className="text-muted-foreground italic">(media only)</span>}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    @{post.author_key}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={unhidingPost === post.doc_id}
                  onClick={() => unhidePost(post.doc_id)}
                  data-testid={`moderation-unhide-post-${post.doc_id}`}
                >
                  {unhidingPost === post.doc_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <>
                      <EyeOff className="mr-1 h-3.5 w-3.5 strokeWidth={1.5}" />
                      Unhide
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The review queue */}
      <div className="border-t border-border pt-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm font-medium text-foreground">Review queue</p>
        </div>
        {flagsError && (
          <div className="rounded bg-danger-muted p-3 text-sm text-danger" data-testid="moderation-queue-error">
            {flagsError}
          </div>
        )}
        {flagsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : flags && flags.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="moderation-queue-empty">
            No flagged users.
          </p>
        ) : (
          <div className="space-y-2" data-testid="moderation-queue">
            {flags?.map((flag) => {
              const isHidden = hiddenUsers.includes(flag.username);
              const isBanned = bannedUsers.includes(flag.username);
              return (
                <div
                  key={flag.username}
                  className="flex items-center justify-between gap-2 rounded-sm border border-border bg-elevated px-3 py-2"
                  data-testid={`moderation-flag-${flag.username}`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      @{flag.username} · {flag.flag_count} {flag.flag_count === 1 ? 'flag' : 'flags'}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {flag.matched_words.slice(0, 3).join(', ')}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant={isHidden ? 'outline' : 'brand'}
                      size="sm"
                      disabled={hidingUser === flag.username}
                      onClick={() => toggleAutoHide(flag.username)}
                      data-testid={`moderation-flag-toggle-${flag.username}`}
                    >
                      {isHidden ? (
                        <>
                          <EyeOff className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                          Hiding
                        </>
                      ) : (
                        <>
                          <Ban className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                          Keep hiding
                        </>
                      )}
                    </Button>
                    <Button
                      variant={isBanned ? 'outline' : 'destructive'}
                      size="sm"
                      disabled={banningUser === flag.username}
                      onClick={() => toggleBan(flag.username)}
                      data-testid={`moderation-flag-ban-${flag.username}`}
                    >
                      {banningUser === flag.username ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
                      ) : isBanned ? (
                        <>
                          <UserX className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                          Unban
                        </>
                      ) : (
                        <>
                          <UserX className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                          Ban
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        data-testid={testId}
        className={cn(
          'relative shrink-0 w-11 h-6 rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-success' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}
