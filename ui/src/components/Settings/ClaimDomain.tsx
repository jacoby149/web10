import * as React from 'react';
import { Globe } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';

const errors: Record<string, string> = {
  txt_record_not_found: 'TXT record not found. Check the host and wait for DNS propagation, then verify again.',
  bad_format: 'The TXT value has the wrong format. Copy the exact value below.',
  wrong_provider: 'The TXT provider does not match this node. Copy the current value below.',
  wrong_user: 'The TXT username does not match this account. Copy the current value below.',
  domain_taken: 'This domain is already claimed. Release it from the other account first.',
  release_required: 'Release your existing domain before connecting another.',
  domain_mismatch: 'The connected domain has changed. Reload status before releasing it.',
  invalid_domain: 'Enter a valid domain such as example.com, without a URL, path or port.',
  dns_timeout: 'DNS lookup timed out. Wait a moment, then verify again.',
  dns_error: 'DNS lookup failed. Check your DNS provider, then verify again.',
  multiple_claims: 'Multiple web10 TXT records found. Keep only the exact record shown below.',
};

export default function ClaimDomain({ I }: { I: Record<string, any> }) {
  const who = I.v3?.readToken?.();
  return <DomainCard key={JSON.stringify([I.accountReadGeneration, I.auth, who?.provider, who?.username, I.v3?.state?.token])} I={I} />;
}

function DomainCard({ I }: { I: Record<string, any> }) {
  const who = I.v3?.readToken?.();
  const provider = who?.provider, username = who?.username, token = I.v3?.state?.token;
  const available = !!(I.auth && provider && username && token);
  const [domain, setDomain] = React.useState('');
  const [claimed, setClaimed] = React.useState('');
  const [verified, setVerified] = React.useState(false);
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [confirm, setConfirm] = React.useState(false);
  const mounted = React.useRef(false);
  const lifecycle = React.useRef(0);
  const locked = React.useRef(false);
  const value = `web10.v=1;provider=${provider};user=${username}`;
  const normalized = domain.trim().toLowerCase();
  const valid = normalized.length <= 247 && normalized.includes('.') && normalized.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) && !/^\d+$/.test(normalized.split('.').slice(-1)[0] || '');
  const origin = I.v3?.state?.apiOrigin;

  function ownership(kind: string) {
    const owns = I.ownAccountRead?.(`domain-${kind}`) || (() => available);
    const generation = lifecycle.current;
    return () => mounted.current && generation === lifecycle.current && owns();
  }

  async function request(action: 'load' | 'verify' | 'release') {
    if (!available || !origin || !mounted.current || locked.current) return;
    const owns = ownership('request');
    if (!owns()) return;
    locked.current = true;
    setBusy(action); setError(''); setStatus('');
    console.log('[auth-ui] domain request started', { action });
    try {
      const response = await fetch(action === 'load' ? `${origin}/v3/users/${encodeURIComponent(username)}/domain` : `${origin}/v3/domains/${action}`, action === 'load' ? undefined : {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, domain: action === 'release' ? claimed : normalized }),
      });
      const data = await response.json();
      if (!owns()) return;
      console.log('[auth-ui] domain request completed', { action, status: response.status });
      if (!response.ok || (action === 'verify' && data.verified !== true) || (action === 'release' && data.released !== true)) {
        const detail = typeof data.detail === 'string' ? data.detail : data.detail?.error;
        const code = data.error || detail;
        setError(errors[code] || 'The node could not complete this request. Check your DNS record and account, then try again.');
        return;
      }
      if (action === 'release') {
        setClaimed(''); setDomain(''); setVerified(false); setConfirm(false);
        setStatus('Domain released. Remove the TXT record at your DNS provider if you no longer want it published.');
      } else {
        const next = typeof data.domain === 'string' ? data.domain : '';
        setClaimed(next); setDomain(next); setVerified(data.verified === true);
        if (action === 'verify') setStatus('Domain verified for this account.');
      }
    } catch {
      if (owns()) setError('Could not reach the node. Check your connection and try again.');
      console.log('[auth-ui] domain request failed', { action });
    } finally {
      if (owns()) { locked.current = false; setBusy(''); }
    }
  }

  React.useEffect(() => {
    mounted.current = true;
    void request('load');
    return () => { mounted.current = false; lifecycle.current++; locked.current = false; };
  }, []);

  async function copy() {
    const owns = ownership('clipboard');
    if (!owns()) return;
    console.log('[auth-ui] domain clipboard started');
    try {
      await navigator.clipboard.writeText(value);
      if (owns()) setStatus('TXT value copied.');
      console.log('[auth-ui] domain clipboard completed');
    } catch {
      if (owns()) setError('Clipboard unavailable. Select and copy the TXT value manually.');
      console.log('[auth-ui] domain clipboard failed');
    }
  }

  return <Card id="domain" data-testid="claim-domain-section" className="min-w-0 scroll-mt-6">
    <CardHeader>
      <div className="flex items-center gap-2"><Globe aria-hidden="true" className="h-5 w-5 text-brand" /><CardTitle><a href="#domain" className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Claim your domain</a></CardTitle></div>
      <CardDescription>Connect a domain you control to this account with a public DNS TXT record. Your username and permissions stay unchanged.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {!available ? <p role="status" className="text-sm text-muted-foreground">Sign in to connect your domain.</p> : <>
        {busy === 'load' ? <div role="status" aria-label="Loading domain status" className="space-y-2"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-10 w-full" /></div> : <>
          <p className="break-all text-sm" data-testid="domain-current">{claimed ? `${claimed} - ${verified ? 'Verified' : 'Not verified'}` : 'No domain connected yet.'}</p>
          <div className="space-y-2"><label htmlFor="claim-domain" className="text-sm font-medium">1. Enter your domain</label>
            <Input id="claim-domain" data-testid="domain-input" value={domain} disabled={!!busy || !!claimed} onChange={e => { setDomain(e.target.value); setError(''); setStatus(''); }} onBlur={() => { if (domain && !valid) setError('Enter a domain such as example.com, without a URL, path or port.'); }} placeholder="example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-describedby="domain-hint" className="h-11" />
            <p id="domain-hint" className="text-xs text-muted-foreground">Domain only, no https:// or path. Release an existing domain before connecting another.</p>
          </div>
          <div className="space-y-3 rounded border border-border bg-muted p-4 text-sm">
            <h3 className="font-medium">2. Add a record at your DNS provider</h3>
            <p className="text-muted-foreground">Don't have a domain yet? Any registrar works — here are two examples:</p>
            <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
              <li><a href="https://njal.la" target="_blank" rel="noreferrer" className="rounded-sm text-brand underline-offset-4 hover:underline">Njalla</a> — privacy-first. They register the domain in their own name, so your name never appears in the public WHOIS, and they don't police content. Best if your work might attract a takedown.</li>
              <li><a href="https://www.godaddy.com" target="_blank" rel="noreferrer" className="rounded-sm text-brand underline-offset-4 hover:underline">GoDaddy</a> — the straightforward option. Easiest to use, but your name is on the registration and they act on copyright complaints.</li>
            </ul>
            <p className="text-muted-foreground">Already have a domain, or picked another registrar? Open its DNS management, then add a TXT record:</p>
            <dl className="space-y-2"><div><dt className="text-muted-foreground">Type / TTL</dt><dd className="font-mono">TXT / 300 seconds</dd></div><div><dt className="text-muted-foreground">Host / name</dt><dd className="font-mono">web10</dd><dd className="break-all text-xs text-muted-foreground">Full name: {valid ? `web10.${normalized}` : 'web10.<your domain>'}. Some providers require the full name.</dd></div><div><dt className="text-muted-foreground">Exact value</dt><dd className="mt-1 select-all break-all font-mono" data-testid="domain-txt">{value}</dd></div></dl>
            <Button type="button" variant="outline" className="min-h-11" onClick={copy} data-testid="domain-copy">Copy TXT value</Button>
          </div>
          <div className="space-y-3"><h3 className="text-sm font-medium">3. Save, wait, then verify</h3><p className="text-sm text-muted-foreground">Save the record at your DNS provider. DNS propagation can take a few minutes or longer. Then verify here; the node checks DNS itself. If it is not found yet, wait and try again.</p>
            <div className="flex flex-wrap gap-2"><Button variant="brand" className="min-h-11" disabled={!!busy || !valid} onClick={() => request('verify')} data-testid="domain-verify">{busy === 'verify' ? 'Verifying...' : claimed ? 'Reverify domain' : 'Verify domain'}</Button>
              {claimed && <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => setConfirm(true)}>Release domain</Button>}
              {error && <Button variant="outline" className="min-h-11" disabled={!!busy} onClick={() => request('load')}>Reload status</Button>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">No key, wallet or signature needed. This is an account alias, not website hosting or a login credential. Do not change A or CNAME records for this setup.</p>
        </>}
      </>}
      <div aria-live="polite" className="min-h-6 text-sm"><p role={error ? 'alert' : 'status'} className={error ? 'text-danger' : 'text-muted-foreground'}>{error || status}</p></div>
      <Dialog open={confirm} onOpenChange={open => { if (!busy) setConfirm(open); }}><DialogContent className="w-[calc(100%-2rem)]"><DialogTitle>Release domain?</DialogTitle><DialogDescription className="break-words">Disconnect {claimed} from this account? Your username, data and permissions will not change. This does not delete your DNS TXT record.</DialogDescription><DialogFooter><Button className="min-h-11" variant="outline" disabled={!!busy} onClick={() => setConfirm(false)}>Cancel</Button><Button className="min-h-11" variant="brand" disabled={!!busy} onClick={() => request('release')}>{busy === 'release' ? 'Releasing...' : 'Confirm release'}</Button></DialogFooter><p role="status" className="text-sm text-danger">{error}</p></DialogContent></Dialog>
    </CardContent>
  </Card>;
}
