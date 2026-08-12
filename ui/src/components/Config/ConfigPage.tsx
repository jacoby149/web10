import React from 'react';
import axios from 'axios';
import AppShell from '../shared/AppShell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, UserPlus, X, Check, Store, ShieldAlert, RotateCcw } from 'lucide-react';

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

  const nodePost = async (path: string, body: Record<string, any>) => {
    const token = I.v3.state.token;
    const decoded = I.v3.readToken();
    const provider = decoded.provider;
    const protocol = window.location.protocol;
    return axios.post(`${protocol}//${provider}${path}`, body, {
      headers: { "Content-Type": "application/json" },
    });
  };

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
      const decoded = I.v3.readToken();
      const protocol = window.location.protocol;
      const resp = await nodePost("/v3/read", {
        token: I.v3.state.token,
        service: "public_posts",
        groups: ["web10.app/groups/web10/discover"],
        limit: 50,
      });
      setBoard((resp.data ?? []).map((d: any) => ({
        author: d.author,
        service: d.service,
        post_id: d.doc_id,
        body_text: d.body?.text || "",
        tags: d.body?.tags || [],
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
      const resp = await nodePost("/admin/discovery/removed", { token: I.v3.state.token });
      setRemovedPosts(resp.data?.removed ?? []);
    } catch {
      // the removed list is secondary — don't overwrite the board error
    }
  };

  const removePost = async (post: BoardPost) => {
    setModeratingId(post.post_id);
    setBoardError(null);
    try {
      await nodePost("/admin/discovery/remove", {
        token: I.v3.state.token,
        author: post.author,
        service: post.service,
        post_id: post.post_id,
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
      await nodePost("/admin/discovery/restore", {
        token: I.v3.state.token,
        author: post.author,
        service: post.service,
        post_id: post.post_id,
      });
      setRemovedPosts(prev => prev.filter(p => p.post_id !== post.post_id));
      loadBoard();
    } catch (e: any) {
      setBoardError(e.response?.data?.detail || "Failed to restore the post.");
    } finally {
      setModeratingId(null);
    }
  };

  React.useEffect(() => {
    if (I.isAdmin) {
      loadConfig();
      loadApps();
      loadBoard();
      loadRemoved();
    } else {
      setLoading(false);
      setAppsLoading(false);
      setBoardLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [I.isAdmin]);

  const [newAdmin, setNewAdmin] = React.useState("");
  const admins: string[] = config?.admins || [];

  const saveAdmins = async (next: string[]) => {
    setSaving(true);
    setError(null);
    try {
      const decoded = I.v3.readToken();
      const protocol = window.location.protocol;
      await nodePost("/config/update", { token: I.v3.state.token, admins: next });
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
  // The /config GET response strips secrets (private_key, s3_secret_key,
  // twilio_auth_token, stripe keys); a naive "send everything" save would
  // overwrite those with empty strings and wipe the node's credentials.
  // Diffing against the loaded snapshot keeps untouched (and stripped)
  // fields off the wire entirely.
  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, any> = { token: I.v3.state.token };
      for (const key of Object.keys(config || {})) {
        if (key === "admins") continue; // admins saved via /admins above
        const next = (config as any)[key];
        const prev = loadedConfig[key];
        if (JSON.stringify(next) === JSON.stringify(prev)) continue;
        payload[key] = next;
      }
      const decoded = I.v3.readToken();
      const protocol = window.location.protocol;
      await axios.patch(
        `${protocol}//${decoded.provider}/config`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );
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

          <Card>
            <CardHeader>
              <CardTitle>Node Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Provider Domain">
                <Input value={config?.provider || ""} onChange={e => updateField("provider", e.target.value)} data-testid="config-provider" />
              </Field>
              <Field label="Brand Name">
                <Input value={config?.brand_text || ""} onChange={e => updateField("brand_text", e.target.value)} data-testid="config-brand-text" />
              </Field>
              <Field label="Logo (dark surfaces)" description="Path or URL for the logo used on dark backgrounds">
                <Input value={config?.logo_dark || ""} onChange={e => updateField("logo_dark", e.target.value)} data-testid="config-logo-dark" />
              </Field>
              <Field label="Logo (light surfaces)" description="Path or URL for the logo used on light backgrounds">
                <Input value={config?.logo_light || ""} onChange={e => updateField("logo_light", e.target.value)} data-testid="config-logo-light" />
              </Field>
              <Field label="CORS Service Managers" description="Comma-separated list of allowed authenticator domains">
                <Input value={config?.cors_service_managers || ""} onChange={e => updateField("cors_service_managers", e.target.value)} data-testid="config-cors" />
              </Field>
              <Field label="Token Expiry (minutes)">
                <Input type="number" value={config?.token_expire_minutes || 87840} onChange={e => updateField("token_expire_minutes", parseInt(e.target.value) || 0)} data-testid="config-token-expiry" />
              </Field>
              <Field label="Signing Algorithm" description="Read-only — RS256 migration is tracked separately (security invariant I1)">
                <Input value={config?.algorithm || "HS256"} disabled data-testid="config-algorithm" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Database</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="ClickHouse URL" description="Connection string the node uses at startup. A change here is persisted for reference, but a running node will not reconnect until restarted.">
                <Input type="password" value={config?.db_url || ""} onChange={e => updateField("db_url", e.target.value)} data-testid="config-db-url" />
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
                <Input type="password" value={config?.s3_secret_key || ""} onChange={e => updateField("s3_secret_key", e.target.value)} data-testid="config-s3-secret-key" />
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
                <Input type="password" value={config?.twilio_auth_token || ""} onChange={e => updateField("twilio_auth_token", e.target.value)} data-testid="config-twilio-auth-token" />
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
                <Input type="password" value={config?.stripe_test_key || ""} onChange={e => updateField("stripe_test_key", e.target.value)} data-testid="config-stripe-test-key" />
              </Field>
              <Field label="Live API Key">
                <Input type="password" value={config?.stripe_live_key || ""} onChange={e => updateField("stripe_live_key", e.target.value)} data-testid="config-stripe-live-key" />
              </Field>
              <Field label="Test Subscription — Credits">
                <Input value={config?.stripe_test_credit_sub_id || ""} onChange={e => updateField("stripe_test_credit_sub_id", e.target.value)} data-testid="config-stripe-test-credit-sub" />
              </Field>
              <Field label="Test Subscription — Space">
                <Input value={config?.stripe_test_space_sub_id || ""} onChange={e => updateField("stripe_test_space_sub_id", e.target.value)} data-testid="config-stripe-test-space-sub" />
              </Field>
              <Field label="Live Subscription — Credits">
                <Input value={config?.stripe_live_credit_sub_id || ""} onChange={e => updateField("stripe_live_credit_sub_id", e.target.value)} data-testid="config-stripe-live-credit-sub" />
              </Field>
              <Field label="Live Subscription — Space">
                <Input value={config?.stripe_live_space_sub_id || ""} onChange={e => updateField("stripe_live_space_sub_id", e.target.value)} data-testid="config-stripe-live-space-sub" />
              </Field>
              <Field label="Dev Pay Split (%)" description="Percentage of revenue that goes to the developer">
                <Input type="number" value={config?.dev_pay_pct || 98} onChange={e => updateField("dev_pay_pct", parseInt(e.target.value) || 98)} data-testid="config-dev-pay-pct" />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </ConfigShell>
  );
}

export default ConfigPage;