import React from 'react';
import { Bot, Check, Shield, X } from 'lucide-react';
import Branding from '../shared/Branding';
import LoginForm from '../CredentialPage/LoginForm';
import { Button } from '@/components/ui/button';

// ── OAuth 2.0 consent screen (D92, O8) ──────────────────────────────────────
// The /oauth/authorize surface: an external app (an AI assistant, a server-side
// connector) asks to act as the signed-in user. The scope is "everything the
// user's existing contracts + group memberships allow" — there is no separate
// scope to grant, so the screen shows who's asking and what they can already
// do, then approve/deny. Approve mints the authorization code via the node's
// POST /v3/oauth/authorize; deny redirects back with error=access_denied.

type OauthParams = {
  client_id: string | null;
  redirect_uri: string | null;
  state: string | null;
};

function parseOauthParams(): OauthParams {
  const q = new URLSearchParams(window.location.search);
  return {
    client_id: q.get('client_id'),
    redirect_uri: q.get('redirect_uri'),
    state: q.get('state'),
  };
}

function hostnameOf(uri: string | null): string {
  if (!uri) return '';
  try {
    return new URL(uri).hostname;
  } catch {
    return uri;
  }
}

function OauthConsentView({ I }: { I: Record<string, any> }) {
  const [params] = React.useState<OauthParams>(parseOauthParams);
  const [clientName, setClientName] = React.useState<string | null>(null);
  const [lookupState, setLookupState] = React.useState<'loading' | 'ok' | 'unknown'>('loading');
  const [approving, setApproving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const authed = I.isAuthenticated?.() ?? false;
  const username = I.username || I.v3?.readToken?.()?.username || '';

  // Look up the client's display name (public fields only — never the secret).
  React.useEffect(() => {
    if (!params.client_id) {
      setLookupState('unknown');
      return;
    }
    let live = true;
    I.oauthClientLookup?.(params.client_id)
      .then((c: any) => {
        if (!live) return;
        setClientName(c?.client_name || params.client_id);
        setLookupState('ok');
      })
      .catch(() => {
        if (!live) return;
        setClientName(params.client_id);
        setLookupState('unknown');
      });
    return () => {
      live = false;
    };
  }, [params.client_id]);

  const approve = () => {
    setApproving(true);
    setError(null);
    I.oauthAuthorize?.(params)
      .then(() => {
        // Success: the node minted the code. The opener (the external app's
        // backend) polls / completes the flow out-of-band; close this window.
        I.setStatus?.(`Connected ${clientName || params.client_id}`);
        setTimeout(() => window.close(), 400);
      })
      .catch((e: any) => {
        setApproving(false);
        setError(e?.message || String(e));
      });
  };

  const deny = () => {
    // Redirect back to the app with error=access_denied (+ state).
    if (params.redirect_uri) {
      const sep = params.redirect_uri.includes('?') ? '&' : '?';
      const url = `${params.redirect_uri}${sep}error=access_denied${params.state ? `&state=${encodeURIComponent(params.state)}` : ''}`;
      window.location.href = url;
      return;
    }
    window.close();
  };

  const callbackHost = hostnameOf(params.redirect_uri);

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-8 text-foreground">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-brand/20 blur-[120px]" />

      <div className="relative flex w-full max-w-md flex-col" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
        <div className="mb-6 flex shrink-0 justify-center">
          <Branding I={I} size="lg" tagline={false} />
        </div>

        <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card shadow-[0_8px_30px_rgb(0_0_0/0.35)]">
          {!authed ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
              <div className="mb-6 text-center">
                <h1 className="font-display text-xl font-semibold text-foreground">
                  Log in to connect <span className="text-brand-300">{clientName || params.client_id}</span>
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in to your node, then choose whether to let this app act as you.
                </p>
              </div>
              <LoginForm I={I} embedded />
            </div>
          ) : lookupState === 'unknown' ? (
            <div className="p-6 text-center sm:p-8" data-testid="oauth-consent-unknown">
              <h1 className="font-display text-xl font-semibold text-foreground">Unknown app</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                &quot;{params.client_id}&quot; isn&apos;t a registered app on this node. Nothing was shared.
              </p>
              <Button variant="ghost" className="mt-5 w-full" onClick={deny} data-testid="oauth-consent-close">
                Close
              </Button>
            </div>
          ) : (
            <>
              {/* header */}
              <div className="shrink-0 border-b border-border p-5 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
                  <Bot className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
                </div>
                <h1 className="font-display text-xl font-semibold text-foreground">
                  Connect <span className="text-brand-300">{clientName}</span>
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  wants to act as <span className="font-medium text-foreground">{username}</span>
                </p>
              </div>

              {/* what it can do — derived from the user's existing grants */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
                <div className="rounded border border-border bg-elevated/40 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                    <Shield className="h-3.5 w-3.5" strokeWidth={2} />
                    What it can do
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    Everything you can already do on your node — post, follow, read your profile, send messages —
                    within the apps and groups you&apos;ve granted access to. There&apos;s no extra permission to
                    grant: it acts as you, under your existing rules.
                  </p>
                </div>
                {callbackHost && (
                  <div className="text-xs text-muted-foreground">
                    Callback: <span className="font-mono text-foreground">{callbackHost}</span>
                  </div>
                )}
                {error && (
                  <p className="text-sm text-danger" role="alert" data-testid="oauth-consent-error">
                    {error}
                  </p>
                )}
              </div>

              {/* actions */}
              <div className="shrink-0 space-y-2 border-t border-border p-4">
                <Button variant="brand" className="w-full" onClick={approve} disabled={approving} data-testid="oauth-consent-approve">
                  {approving ? 'Connecting…' : (<><Check className="mr-1.5 h-4 w-4" strokeWidth={2} />Allow {clientName}</>)}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-foreground"
                  onClick={deny}
                  data-testid="oauth-consent-deny"
                >
                  <X className="mr-1.5 h-4 w-4" strokeWidth={2} />
                  Deny
                </Button>
              </div>
            </>
          )}
        </div>

        {authed && (
          <p className="mt-4 shrink-0 text-center text-xs text-muted-foreground">
            Signed in as <span className="text-foreground">{username}</span>
            {' · '}
            <button
              type="button"
              onClick={() => I.logout()}
              className="rounded underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="oauth-consent-logout"
            >
              Not you? Log out
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default OauthConsentView;
