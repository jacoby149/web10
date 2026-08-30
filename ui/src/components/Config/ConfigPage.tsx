import React from 'react';
import axios from 'axios';
import AppShell from '../shared/AppShell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, UserPlus, X, Check, Store, ShieldAlert, RotateCcw, Ban, Plus, EyeOff } from 'lucide-react';

function ToggleRow({ label, description, checked, onChange, testId }: {
  label: string; description: string; checked: boolean; onChange: () => void; testId: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-b-0">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={onChange} data-testid={testId} />
        <span className="slider round"></span>
      </label>
    </div>
  );
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-muted-foreground">{label}</Label>
      {children}
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function ConfigShell({ I, children }: { I: Record<string, any>; children: React.ReactNode }) {
  // pages here bring their own padded max-w-2xl containers, so render flush
  return (
    <AppShell I={I} padded={false}>
      {children}
    </AppShell>
  );
}

interface AdminApp {
  url: string;
  approved: boolean;
  name?: string;
  description?: string;
  icon_url?: string;
  registered_at?: string | null;
  review_state?: string;
  rating_average?: number | null;
  rating_count?: number;
}

interface BoardPost {
  author: string;
  service: string;
  post_id: string;
  body_text: string;
  tags: string[];
  created_at?: string | null;
  removed_by?: string | null;
  removed_at?: string | null;
  removal_reason?: string;
}

// The node-default universal public board (matches the API's DISCOVER_GROUP_ID).
// The board is a group read; moderation is a group op on this group.
const DISCOVER_GROUP = "web10.app/groups/web10/discover";

interface ModFlag {
  username: string;
  flag_count: number;
  last_flagged: string;
  matched_words: string[];
}

function ConfigPage({ I }: { I: Record<string, any> }) {
  const [config, setConfig] = React.useState<Record<string, any> | null>(null);
  const [loadedConfig, setLoadedConfig] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const [apps, setApps] = React.useState<AdminApp[]>([]);
  const [appsLoading, setAppsLoading] = React.useState(true);
  const [appsError, setAppsError] = React.useState<string | null>(null);
  const [approvingUrl, setApprovingUrl] = React.useState<string | null>(null);

  const [board, setBoard] = React.useState<BoardPost[]>([]);
  const [boardLoading, setBoardLoading] = React.useState(true);
  const [boardError, setBoardError] = React.useState<string | null>(null);
  const [removedPosts, setRemovedPosts] = React.useState<BoardPost[]>([]);
  const [confirmRemoveId, setConfirmRemoveId] = React.useState<string | null>(null);
  const [removeReason, setRemoveReason] = React.useState("");
  const [moderatingId, setModeratingId] = React.useState<string | null>(null);

  // Content moderation (D57) — the review queue + the blocklist editor.
  const [modFlags, setModFlags] = React.useState<ModFlag[]>([]);
  const [modFlagsLoading, setModFlagsLoading] = React.useState(true);
  const [modFlagsError, setModFlagsError] = React.useState<string | null>(null);
  const [newWord, setNewWord] = React.useState("");
  const [autoHidingUser, setAutoHidingUser] = React.useState<string | null>(null);

  const nodePost = async (path: string, body: Record<string, any>) => {
    const token = I.v3.state.token;
    const decoded = I.v3.readToken();
    const provider = decoded.provider;
    const protocol = window.location.protocol;
    return axios.post(`${protocol}//${provider}${path}`, body, {
      headers: { "Content-Type": "application/json" },
    });
  };

  // /config/update takes TWO body models — `token: Token` (a nested object
  // carrying the JWT) and `update: ConfigUpdate` (the field changes). FastAPI
  // therefore expects { token: { token }, update: {...} }, NOT a flat
  // { token, ...fields }. This helper builds the correct shape so every save
  // path (main Save + Admins) persists instead of 422ing.
  const configUpdate = (fields: Record<string, any>) =>
    nodePost("/config/update", { token: { token: I.v3.state.token }, update: fields });

  const loadConfig = async () => {
    try {
      const resp = await nodePost("/config", { token: I.v3.state.token });
      setConfig(resp.data);
      setLoadedConfig({ ...resp.data });
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load config. Are you an admin?");
    } finally {
      setLoading(false);
    }
  };

  const loadApps = async () => {
    setAppsLoading(true);
    setAppsError(null);
    try {
      const resp = await nodePost("/v3/apps/admin", { token: I.v3.state.token });
      setApps(resp.data?.apps ?? []);
    } catch (e: any) {
      setAppsError(e.response?.data?.detail || "Failed to load registered apps.");
    } finally {
      setAppsLoading(false);
    }
  };

  const loadBoard = async () => {
    setBoardLoading(true);
    setBoardError(null);
    try {
      // v3: the public board is the node-default discover group, read anon
      // through the normal group-read path (no token, no app contract).
      // Discovery IS a group read — there is no separate discover endpoint.
      const resp = await nodePost("/v3/read", {
        service: "posts",
        groups: [DISCOVER_GROUP],
        limit: 50,
      });
      setBoard((resp.data ?? []).map((d: any) => ({
        author: d.author_key,
        service: d.service,
        post_id: d.doc_id,
        body_text: d.body?.text || "",
        tags: d.tags || [],
        created_at: d.created_at,
      })));
    } catch (e: any) {
      setBoardError(e.response?.data?.detail || "Failed to load the public board.");
    } finally {
      setBoardLoading(false);
    }
  };

  const loadRemoved = async () => {
    try {
      // Board moderation is a group op: list the docs hidden from the
      // discover group (the public board).
      const resp = await nodePost("/v3/groups/hidden", {
        token: I.v3.state.token,
        group_id: DISCOVER_GROUP,
      });
      const hidden: any[] = resp.data?.hidden ?? [];
      setRemovedPosts(hidden.map((d: any) => ({
        author: d.author_key,
        service: "posts",
        post_id: d.doc_id,
        body_text: d.body?.text || "",
        tags: d.body?.tags || [],
        created_at: d.hidden_at,
        removed_by: d.moderator_key,
        removed_at: d.hidden_at,
        removal_reason: "",
      })));
    } catch {
      // the removed list is secondary — don't overwrite the board error
    }
  };

  const removePost = async (post: BoardPost) => {
    setModeratingId(post.post_id);
    setBoardError(null);
    try {
      await nodePost("/v3/groups/hide", {
        token: I.v3.state.token,
        group_id: DISCOVER_GROUP,
        doc_id: post.post_id,
        reason: removeReason.trim(),
      });
      setBoard(prev => prev.filter(p => p.post_id !== post.post_id));
      setConfirmRemoveId(null);
      setRemoveReason("");
      loadRemoved();
    } catch (e: any) {
      setBoardError(e.response?.data?.detail || "Failed to remove the post.");
    } finally {
      setModeratingId(null);
    }
  };

  const restorePost = async (post: BoardPost) => {
    setModeratingId(post.post_id);
    setBoardError(null);
    try {
      await nodePost("/v3/groups/unhide", {
        token: I.v3.state.token,
        group_id: DISCOVER_GROUP,
        doc_id: post.post_id,
      });
      setRemovedPosts(prev => prev.filter(p => p.post_id !== post.post_id));
      loadBoard();
    } catch (e: any) {
      setBoardError(e.response?.data?.detail || "Failed to restore the post.");
    } finally {
      setModeratingId(null);
    }
  };

  // --- Content moderation (D57) -------------------------------------------

  const loadFlags = async () => {
    setModFlagsLoading(true);
    setModFlagsError(null);
    try {
      const resp = await nodePost("/v3/moderation/flags", { token: I.v3.state.token });
      setModFlags(resp.data?.flags ?? []);
    } catch (e: any) {
      setModFlagsError(e.response?.data?.detail || "Failed to load the moderation queue.");
    } finally {
      setModFlagsLoading(false);
    }
  };

  const sensitiveWords: string[] = config?.sensitive_words || [];
  const autoHideUsers: string[] = config?.auto_hide_users || [];

  const addWord = () => {
    const word = newWord.trim().toLowerCase();
    if (!word || sensitiveWords.includes(word)) return;
    updateField("sensitive_words", [...sensitiveWords, word]);
    setNewWord("");
  };

  const removeWord = (word: string) =>
    updateField("sensitive_words", sensitiveWords.filter(w => w !== word));

  // "Keep hiding" / "Restore" — adds or removes a username from the node's
  // auto_hide_users list (a direct action, not a config save). Already-hidden
  // posts are unaffected; this governs the user's FUTURE posts.
  const toggleAutoHide = async (username: string) => {
    const hide = !autoHideUsers.includes(username);
    setAutoHidingUser(username);
    setModFlagsError(null);
    try {
      const resp = await nodePost("/v3/moderation/auto-hide", {
        token: I.v3.state.token,
        username,
        hide,
      });
      updateField("auto_hide_users", resp.data?.auto_hide_users ?? autoHideUsers);
    } catch (e: any) {
      setModFlagsError(e.response?.data?.detail || "Failed to update the auto-hide list.");
    } finally {
      setAutoHidingUser(null);
    }
  };

  React.useEffect(() => {
    if (I.isAdmin) {
      loadConfig();
      loadApps();
      loadBoard();
      loadRemoved();
      loadFlags();
    } else {
      setLoading(false);
      setAppsLoading(false);
      setBoardLoading(false);
      setModFlagsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [I.isAdmin]);

  const [newAdmin, setNewAdmin] = React.useState("");
  const admins: string[] = config?.admins || [];

  const saveAdmins = async (next: string[]) => {
    setSaving(true);
    setError(null);
    try {
      await configUpdate({ admins: next });
      setConfig(prev => ({ ...prev, admins: next }));
      setLoadedConfig(prev => ({ ...prev, admins: next }));
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to update admins");
    } finally {
      setSaving(false);
    }
  };

  const addAdmin = () => {
    const name = newAdmin.trim();
    if (!name || admins.includes(name)) return;
    saveAdmins([...admins, name]);
    setNewAdmin("");
  };

  const removeAdmin = (name: string) => saveAdmins(admins.filter(a => a !== name));

  const updateField = (key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  // Only send fields that actually changed from the loaded snapshot.
  // Keeps the payload to real edits — unchanged values (including the
  // billing fields this form no longer shows) stay off the wire, so a save
  // can never clobber a field the operator didn't touch.
  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    try {
      const update: Record<string, any> = {};
      for (const key of Object.keys(config || {})) {
        if (key === "admins") continue; // admins saved via the Admins card
        const next = (config as any)[key];
        const prev = loadedConfig[key];
        if (JSON.stringify(next) === JSON.stringify(prev)) continue;
        update[key] = next;
      }
      await configUpdate(update);
      setLoadedConfig({ ...config });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const setApproval = async (url: string, approved: boolean) => {
    setApprovingUrl(url);
    try {
      await nodePost("/v3/apps/approve", { token: I.v3.state.token, url, approved });
      setApps(prev => prev.map(a => a.url === url ? { ...a, approved } : a));
    } catch (e: any) {
      setAppsError(e.response?.data?.detail || "Failed to update approval.");
    } finally {
      setApprovingUrl(null);
    }
  };

  // Not an admin — a calm, explanatory gate, not a red error.
  if (!I.isAdmin) {
    return (
      <ConfigShell I={I}>
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
          <div
            className="flex flex-col items-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center"
            data-testid="config-admins-only"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
              <Lock className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
            </div>
            <h2 className="font-display text-lg font-semibold text-foreground">Admins only</h2>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Node Configuration controls the whole node — signing, billing, and
              access policy. Only this node's admins can view or change it. Ask an
              admin to add your account.
            </p>
          </div>
        </div>
      </ConfigShell>
    );
  }

  if (loading) {
    return (
      <ConfigShell I={I}>
        <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6" data-testid="config-page-loading">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </ConfigShell>
    );
  }

  if (error && !config) {
    return (
      <ConfigShell I={I}>
        <div className="mx-auto max-w-2xl p-4 sm:p-6">
          <div
            className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
            data-testid="config-page-error"
          >
            {error}
          </div>
        </div>
      </ConfigShell>
    );
  }

  const pendingCount = apps.filter(a => !a.approved).length;

  return (
    <ConfigShell I={I}>
      <div className="mx-auto max-w-2xl p-4 sm:p-6" data-testid="config-page">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground">Node Configuration</h1>
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-success" data-testid="config-saved-indicator">Saved</span>}
            <Button onClick={saveConfig} disabled={saving} data-testid="config-save-button">
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded bg-danger-muted p-3 text-sm text-danger" data-testid="config-save-error">{error}</div>
        )}

        <div className="space-y-6">
          <Card data-testid="config-admins-card">
            <CardHeader>
              <CardTitle>Admins</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Accounts that can view and change this node's configuration.
              </p>
              <div className="space-y-2">
                {admins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No admins configured.</p>
                ) : (
                  admins.map((name) => (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded-sm border border-border bg-elevated px-3 py-2"
                    >
                      <span className="font-mono text-sm text-foreground">{name}</span>
                      <button
                        type="button"
                        onClick={() => removeAdmin(name)}
                        disabled={saving || admins.length === 1}
                        aria-label={`Remove admin ${name}`}
                        title={admins.length === 1 ? "A node must keep at least one admin" : `Remove ${name}`}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-danger-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
                        data-testid={`config-admin-remove-${name}`}
                      >
                        <X className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newAdmin}
                  onChange={(e) => setNewAdmin(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addAdmin()}
                  placeholder="username to grant admin"
                  aria-label="New admin username"
                  data-testid="config-admin-add-input"
                />
                <Button onClick={addAdmin} disabled={saving || !newAdmin.trim()} data-testid="config-admin-add-button">
                  <UserPlus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="config-appstore-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-brand-300" strokeWidth={1.5} />
                <CardTitle>App Store Approvals</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Any app can register on the node — but it stays hidden from the
                public App Store until you approve it. {pendingCount > 0 && (
                  <span className="font-medium text-warning">
                    {pendingCount} pending {pendingCount === 1 ? "app" : "apps"}.
                  </span>
                )}
              </p>

              {appsError && (
                <div className="rounded bg-danger-muted p-3 text-sm text-danger" data-testid="config-apps-error">
                  {appsError}
                </div>
              )}

              {appsLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : apps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No apps registered yet.</p>
              ) : (
                <div className="space-y-2" data-testid="config-apps-list">
                  {apps.map((app) => (
                    <div
                      key={app.url}
                      className="flex items-center justify-between rounded-sm border border-border bg-elevated px-3 py-2"
                      data-testid={`config-app-row-${app.url}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-mono text-sm text-foreground">
                          {app.name || app.url}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {app.url}
                          {app.rating_count ? ` · ${app.rating_average}★ (${app.rating_count})` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {app.approved ? (
                          <>
                            <span className="text-xs text-success" data-testid={`config-app-status-${app.url}`}>
                              Approved
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={approvingUrl === app.url}
                              onClick={() => setApproval(app.url, false)}
                              data-testid={`config-app-unapprove-${app.url}`}
                            >
                              Unapprove
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-warning" data-testid={`config-app-status-${app.url}`}>
                              Pending
                            </span>
                            <Button
                              variant="brand"
                              size="sm"
                              disabled={approvingUrl === app.url}
                              onClick={() => setApproval(app.url, true)}
                              data-testid={`config-app-approve-${app.url}`}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                              Approve
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="config-moderation-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-brand-300" strokeWidth={1.5} />
                <CardTitle>Board Moderation</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Hide an inappropriate post from the public board (trending, discover,
                search). The author's own copy is untouched — this is board-level
                takedown, and removed posts can be restored below.{" "}
                {removedPosts.length > 0 && (
                  <span className="font-medium text-warning">
                    {removedPosts.length} removed {removedPosts.length === 1 ? "post" : "posts"}.
                  </span>
                )}
              </p>

              {boardError && (
                <div className="rounded bg-danger-muted p-3 text-sm text-danger" data-testid="config-mod-error">
                  {boardError}
                </div>
              )}

              {boardLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : board.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="config-mod-empty">
                  Nothing on the public board yet.
                </p>
              ) : (
                <div className="space-y-2" data-testid="config-mod-list">
                  {board.map((post) => (
                    <div
                      key={post.post_id}
                      className="rounded-sm border border-border bg-elevated px-3 py-2"
                      data-testid={`config-mod-row-${post.post_id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-mono text-xs text-muted-foreground">
                            @{post.author} · {post.service}
                            {post.created_at && ` · ${new Date(post.created_at).toLocaleDateString()}`}
                          </div>
                          <div className="truncate text-sm text-foreground">
                            {post.body_text || "(media post)"}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={moderatingId === post.post_id}
                          onClick={() => {
                            setConfirmRemoveId(post.post_id);
                            setRemoveReason("");
                          }}
                          data-testid={`config-mod-remove-${post.post_id}`}
                        >
                          Remove
                        </Button>
                      </div>
                      {confirmRemoveId === post.post_id && (
                        <div className="mt-2 space-y-2 border-t border-border pt-2" data-testid={`config-mod-confirm-${post.post_id}`}>
                          <Input
                            value={removeReason}
                            onChange={(e) => setRemoveReason(e.target.value)}
                            placeholder="reason (optional — shown to admins only)"
                            aria-label="Removal reason"
                            data-testid={`config-mod-reason-${post.post_id}`}
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="brand"
                              size="sm"
                              disabled={moderatingId === post.post_id}
                              onClick={() => removePost(post)}
                              data-testid={`config-mod-confirm-remove-${post.post_id}`}
                            >
                              {moderatingId === post.post_id ? "Removing…" : "Confirm remove"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmRemoveId(null)}
                              data-testid={`config-mod-cancel-${post.post_id}`}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {removedPosts.length > 0 && (
                <div className="space-y-2 border-t border-border pt-3" data-testid="config-mod-removed-list">
                  <p className="text-xs font-medium text-muted-foreground">Removed posts</p>
                  {removedPosts.map((post) => (
                    <div
                      key={post.post_id}
                      className="flex items-center justify-between gap-2 rounded-sm border border-dashed border-border px-3 py-2"
                      data-testid={`config-mod-removed-row-${post.post_id}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-mono text-xs text-muted-foreground">
                          @{post.author} · removed by {post.removed_by}
                          {post.removal_reason && ` · ${post.removal_reason}`}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {post.body_text || "(media post)"}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={moderatingId === post.post_id}
                        onClick={() => restorePost(post)}
                        data-testid={`config-mod-restore-${post.post_id}`}
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" strokeWidth={1.5} />
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="config-content-moderation-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-brand-300" strokeWidth={1.5} />
                <CardTitle>Content Moderation (D57)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Automatic sensitive-language detection on the public board. A post
                whose text trips the blocklist is hidden from Discover and its
                author is added to the review queue below. The author's own copy
                and their followers' feed are untouched — this is board curation,
                not a ban.
              </p>

              <ToggleRow
                label="Moderation enabled"
                description="Master switch. Off = no detection runs at all."
                checked={config?.moderation_enabled ?? true}
                onChange={() => updateField("moderation_enabled", !(config?.moderation_enabled ?? true))}
                testId="config-moderation-enabled"
              />
              <ToggleRow
                label="Auto-hide on match"
                description="When on, a matching post is hidden from Discover immediately. When off, it is only flagged for review."
                checked={config?.auto_moderate ?? true}
                onChange={() => updateField("auto_moderate", !(config?.auto_moderate ?? true))}
                testId="config-moderation-auto"
              />

              <div>
                <Label className="mb-1 block text-muted-foreground">Blocklist</Label>
                <p className="mb-2 text-xs text-muted-foreground">
                  Whole-word, case-insensitive. Ships with a default slur list; add
                  or remove words. Changes apply on the next post.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={newWord}
                    onChange={e => setNewWord(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addWord()}
                    placeholder="add a word"
                    aria-label="Add a word to the blocklist"
                    data-testid="config-moderation-word-input"
                  />
                  <Button onClick={addWord} disabled={saving || !newWord.trim()} data-testid="config-moderation-word-add">
                    <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
                    Add
                  </Button>
                </div>
                {sensitiveWords.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Blocklist is empty — detection is off.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5" data-testid="config-moderation-words">
                    {sensitiveWords.map(word => (
                      <span
                        key={word}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-2.5 py-1 font-mono text-xs text-foreground"
                        data-testid={`config-moderation-word-${word}`}
                      >
                        {word}
                        <button
                          type="button"
                          onClick={() => removeWord(word)}
                          aria-label={`Remove ${word} from the blocklist`}
                          className="text-muted-foreground transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          data-testid={`config-moderation-word-remove-${word}`}
                        >
                          <X className="h-3 w-3" strokeWidth={2} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Review queue</p>
                {modFlagsError && (
                  <div className="rounded bg-danger-muted p-3 text-sm text-danger" data-testid="config-moderation-queue-error">
                    {modFlagsError}
                  </div>
                )}
                {modFlagsLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : modFlags.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="config-moderation-queue-empty">
                    No flagged users.
                  </p>
                ) : (
                  <div className="space-y-2" data-testid="config-moderation-queue">
                    {modFlags.map(flag => {
                      const isHidden = autoHideUsers.includes(flag.username);
                      return (
                        <div
                          key={flag.username}
                          className="flex items-center justify-between gap-2 rounded-sm border border-border bg-elevated px-3 py-2"
                          data-testid={`config-moderation-flag-${flag.username}`}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-mono text-xs text-muted-foreground">
                              @{flag.username} · {flag.flag_count} {flag.flag_count === 1 ? "flag" : "flags"}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {flag.matched_words.slice(0, 3).join(", ")}
                            </div>
                          </div>
                          <Button
                            variant={isHidden ? "outline" : "brand"}
                            size="sm"
                            className="shrink-0"
                            disabled={autoHidingUser === flag.username}
                            onClick={() => toggleAutoHide(flag.username)}
                            data-testid={`config-moderation-flag-toggle-${flag.username}`}
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Node Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Provider Domain">
                <Input value={config?.provider || ""} onChange={e => updateField("provider", e.target.value)} data-testid="config-provider" />
              </Field>
              <Field label="CORS Service Managers" description="Comma-separated list of allowed authenticator domains">
                <Input value={config?.cors_service_managers || ""} onChange={e => updateField("cors_service_managers", e.target.value)} data-testid="config-cors" />
              </Field>
              <Field label="Token Expiry (minutes)">
                <Input type="number" value={config?.token_expire_minutes || 87840} onChange={e => updateField("token_expire_minutes", parseInt(e.target.value) || 0)} data-testid="config-token-expiry" />
              </Field>
            </CardContent>
          </Card>

          <Card data-testid="config-telemetry-card">
            <CardHeader>
              <CardTitle>Telemetry (D56)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Usage analytics for the whole platform — GA4 (pageviews + events)
                and Hotjar (session recordings, content-masked). Set an ID to turn
                that instrument on; leave blank to turn it off. Changes apply live
                on the next page load — no rebuild. These are public identifiers,
                not secrets.
              </p>
              <Field label="GA4 Measurement ID" description="e.g. G-XXXXXXXXXX. Blank = GA4 off.">
                <Input value={config?.ga4_measurement_id || ""} onChange={e => updateField("ga4_measurement_id", e.target.value)} placeholder="G-XXXXXXXXXX" data-testid="config-ga4-id" />
              </Field>
              <Field label="Hotjar Site ID" description="e.g. 123456. Blank = Hotjar off.">
                <Input value={config?.hotjar_site_id || ""} onChange={e => updateField("hotjar_site_id", e.target.value)} placeholder="123456" data-testid="config-hotjar-id" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Database</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="ClickHouse URL" description="Connection string the node uses at startup. A change here is persisted for reference, but a running node will not reconnect until restarted.">
                <Input value={config?.db_url || ""} onChange={e => updateField("db_url", e.target.value)} data-testid="config-db-url" />
              </Field>
              <Field label="Database Name">
                <Input value={config?.db_name || "web10"} onChange={e => updateField("db_name", e.target.value)} data-testid="config-db-name" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Access Policy</CardTitle>
            </CardHeader>
            <CardContent>
              <ToggleRow
                label="Beta Code Required"
                description="Users need a valid beta code to sign up"
                checked={config?.beta_required || false}
                onChange={() => updateField("beta_required", !config?.beta_required)}
                testId="config-toggle-beta-required"
              />
              {config?.beta_required && (
                <div className="mb-2 mt-3 pl-5">
                  <Field label="Beta Code">
                    <Input value={config?.beta_code || ""} onChange={e => updateField("beta_code", e.target.value)} data-testid="config-beta-code" />
                  </Field>
                </div>
              )}
              <ToggleRow
                label="Phone Verification"
                description="Require phone number on signup"
                checked={config?.verify_required || false}
                onChange={() => updateField("verify_required", !config?.verify_required)}
                testId="config-toggle-verify-required"
              />
              <ToggleRow
                label="Payment Required"
                description="Users must subscribe to use the node"
                checked={config?.pay_required || false}
                onChange={() => updateField("pay_required", !config?.pay_required)}
                testId="config-toggle-pay-required"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Free Tier Defaults</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Free Credits / Month">
                <Input type="number" step="0.01" value={config?.free_credits || 0.10} onChange={e => updateField("free_credits", parseFloat(e.target.value) || 0)} data-testid="config-free-credits" />
              </Field>
              <Field label="Free Space (MB) / Month">
                <Input type="number" value={config?.free_space || 8} onChange={e => updateField("free_space", parseInt(e.target.value) || 0)} data-testid="config-free-space" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Media Storage (S3)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="S3 Endpoint">
                <Input value={config?.s3_endpoint || ""} onChange={e => updateField("s3_endpoint", e.target.value)} data-testid="config-s3-endpoint" />
              </Field>
              <Field label="Bucket Name">
                <Input value={config?.s3_bucket || ""} onChange={e => updateField("s3_bucket", e.target.value)} data-testid="config-s3-bucket" />
              </Field>
              <Field label="Access Key">
                <Input value={config?.s3_access_key || ""} onChange={e => updateField("s3_access_key", e.target.value)} data-testid="config-s3-access-key" />
              </Field>
              <Field label="Secret Key">
                <Input value={config?.s3_secret_key || ""} onChange={e => updateField("s3_secret_key", e.target.value)} data-testid="config-s3-secret-key" />
              </Field>
              <Field label="Region">
                <Input value={config?.s3_region || "us-east-1"} onChange={e => updateField("s3_region", e.target.value)} data-testid="config-s3-region" />
              </Field>
              <ToggleRow
                label="Use SSL"
                description="Sign internal S3 requests over TLS"
                checked={config?.s3_use_ssl || false}
                onChange={() => updateField("s3_use_ssl", !config?.s3_use_ssl)}
                testId="config-toggle-s3-ssl"
              />
              <Field label="Max Upload Size (bytes)">
                <Input type="number" value={config?.max_upload_size || 524288000} onChange={e => updateField("max_upload_size", parseInt(e.target.value) || 0)} data-testid="config-max-upload-size" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Twilio (SMS Verification)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Service SID">
                <Input value={config?.twilio_service || ""} onChange={e => updateField("twilio_service", e.target.value)} data-testid="config-twilio-service" />
              </Field>
              <Field label="Account SID">
                <Input value={config?.twilio_account_sid || ""} onChange={e => updateField("twilio_account_sid", e.target.value)} data-testid="config-twilio-account-sid" />
              </Field>
              <Field label="Auth Token">
                <Input value={config?.twilio_auth_token || ""} onChange={e => updateField("twilio_auth_token", e.target.value)} data-testid="config-twilio-auth-token" />
              </Field>
              <Field label="Phone Number">
                <Input value={config?.twilio_number || ""} onChange={e => updateField("twilio_number", e.target.value)} data-testid="config-twilio-number" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stripe (Payments)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Mode">
                <select
                  className="flex h-9 w-full rounded-sm border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  value={config?.stripe_status || "test"}
                  onChange={e => updateField("stripe_status", e.target.value)}
                  data-testid="config-stripe-mode"
                >
                  <option value="test">Test</option>
                  <option value="live">Live</option>
                </select>
              </Field>
              <Field label="Test API Key">
                <Input value={config?.stripe_test_key || ""} onChange={e => updateField("stripe_test_key", e.target.value)} data-testid="config-stripe-test-key" />
              </Field>
              <Field label="Live API Key">
                <Input value={config?.stripe_live_key || ""} onChange={e => updateField("stripe_live_key", e.target.value)} data-testid="config-stripe-live-key" />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </ConfigShell>
  );
}

export default ConfigPage;