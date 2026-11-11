import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, ArrowUpCircle, CheckCircle2, CloudOff, ExternalLink } from 'lucide-react';

/**
 * The admin update check (POST /admin/update_status — KB:
 * web10-v3/setup/update-check.md). The node bakes its own version at image
 * build time and reads the upstream changelog's top line from GitHub; this
 * card tells the operator which version a redeploy would bring.
 *
 * Detection, not auto-update: a stateful node does not redeploy its own
 * containers (no docker socket by design) — the copy below says the truth
 * for each deploy flavor instead of pretending a button applies the patch.
 */
export interface UpdateStatusPayload {
  node_version: string;
  latest_version: string | null;
  update_available: boolean | null;
  upstream: { repo: string; ref: string; url: string | null };
  status: 'update-available' | 'up-to-date' | 'version-unknown' | 'unavailable';
  reason: string | null;
  checked_at: string | null;
  cached: boolean;
}

// Canned data for the ?mock=1 preview (the mock interface has no node —
// same pattern as AnalyticsPage's mockSummary).
function mockUpdateStatus(): UpdateStatusPayload {
  return {
    node_version: '5.15.1',
    latest_version: '5.16.0',
    update_available: true,
    upstream: { repo: 'jacoby149/web10', ref: 'main', url: 'https://github.com/jacoby149/web10' },
    status: 'update-available',
    reason: null,
    checked_at: new Date().toISOString(),
    cached: false,
  };
}

function UpdateStatus({ I, post }: { I: Record<string, any>; post: (path: string, body: Record<string, any>) => Promise<{ data: any }> }) {
  const [data, setData] = React.useState<UpdateStatusPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [checking, setChecking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = async (force: boolean) => {
    if (force) setChecking(true);
    else setLoading(true);
    setError(null);
    console.log('[auth-ui] update-status load', { force });
    try {
      if (I.isMock) {
        setData(mockUpdateStatus());
        return;
      }
      const resp = await post(`/admin/update_status${force ? '?force=true' : ''}`, { token: I.v3.state.token });
      const payload = resp?.data;
      // The API contract guarantees `status` — anything else (an old node
      // build answering with {}, a proxy page, …) degrades to the error note.
      if (!payload || typeof payload !== 'object' || typeof payload.status !== 'string') {
        throw new Error('unexpected update-status payload');
      }
      setData(payload);
      console.log('[auth-ui] update-status payload', JSON.stringify(payload));
    } catch (e: any) {
      // A node running an older build 404s this route — the card degrades
      // to a muted note instead of taking the whole config page down.
      setData(null);
      setError(e.response?.data?.detail || "Couldn't load the update status.");
      console.error('[auth-ui] update-status load failed', e);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  React.useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changelogUrl = data?.upstream?.url
    ? `${data.upstream.url}/blob/${encodeURIComponent(data.upstream.ref || 'main')}/knowledge-base/changelogs/CHANGELOG.md`
    : null;

  return (
    <Card data-testid="config-update-card">
      <CardHeader>
        <CardTitle>Version &amp; Updates</CardTitle>
        <p className="text-xs text-muted-foreground">
          This node's release version against the upstream changelog on GitHub.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data ? (
          <Skeleton className="h-16 w-full" />
        ) : error && !data ? (
          <div className="rounded-sm border border-border bg-elevated px-3 py-2 text-sm text-muted-foreground" data-testid="config-update-error">
            {error} The node's version and update check are available from the API's <span className="font-mono text-xs">/admin/update_status</span>.
          </div>
        ) : data ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4" data-testid="config-update-status" data-status={data.status}>
              {data.status === 'update-available' ? (
                <div className="flex items-start gap-3">
                  <ArrowUpCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <div className="text-sm font-medium text-warning">Update available</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      This node runs <span className="font-mono text-xs text-foreground" data-testid="config-update-version-current">{data.node_version}</span>.
                      A redeploy brings{' '}
                      <span className="font-mono text-xs text-foreground" data-testid="config-update-version-latest">{data.latest_version}</span>.
                    </div>
                  </div>
                </div>
              ) : data.status === 'up-to-date' ? (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <div className="text-sm font-medium text-success">Up to date</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      Running <span className="font-mono text-xs text-foreground" data-testid="config-update-version-current">{data.node_version}</span> — the
                      latest release.
                    </div>
                  </div>
                </div>
              ) : data.status === 'version-unknown' ? (
                <div className="flex items-start gap-3">
                  <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <div className="text-sm font-medium text-foreground">Version not reported</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      This build does not report its version (code-mounted dev node). Upstream latest:{' '}
                      <span className="font-mono text-xs text-foreground" data-testid="config-update-version-latest">{data.latest_version}</span>.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                  <div>
                    <div className="text-sm font-medium text-foreground">Update check unavailable</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      The node couldn't reach GitHub to compare versions{data.node_version !== 'unknown' ? (
                        <> — it is running <span className="font-mono text-xs text-foreground" data-testid="config-update-version-current">{data.node_version}</span></>
                      ) : null}
                      . Check again later.
                    </div>
                  </div>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => load(true)}
                disabled={checking}
                data-testid="config-update-check-now"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                {checking ? 'Checking…' : 'Check now'}
              </Button>
            </div>

            {data.status === 'update-available' && (
              <div className="rounded-sm border border-border bg-elevated px-3 py-2 text-xs text-muted-foreground" data-testid="config-update-hint">
                Updating this node is a stack redeploy, not an in-app action — the node does not restart itself. Git-backed stacks
                (ubuntu-deployment) pick up a new release automatically; elsewhere: pull the new image and recreate the <span className="font-mono">api</span> container.
              </div>
            )}

            {(changelogUrl && data.latest_version) || data?.upstream?.url ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {changelogUrl && data.latest_version ? (
                  <a
                    href={changelogUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-sm text-brand-300 hover:text-brand-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    data-testid="config-update-release-link"
                  >
                    What's new in {data.latest_version}
                    <ExternalLink className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                  </a>
                ) : null}
                {data.upstream.url && (
                  <a
                    href={data.upstream.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    data-testid="config-update-repo-link"
                  >
                    <span className="font-mono">{data.upstream.repo}</span>
                    {data.upstream.ref ? (
                      <>
                        {' '}
                        @ <span className="font-mono">{data.upstream.ref}</span>
                      </>
                    ) : null}
                  </a>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default UpdateStatus;
