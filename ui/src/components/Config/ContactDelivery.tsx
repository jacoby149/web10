import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Mail, Server, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SecretInput } from '@/components/ui/secret-input';
import { Skeleton } from '@/components/ui/skeleton';
import { contactHandoff } from '@/lib/contactHandoff';
import ProviderSetupLink, { TwilioCredentialHelp } from './ProviderSetupLink';

type Status = {
  available: boolean; gmail_available: boolean; email_provider: string;
  gmail_connected: boolean; gmail_sender: string;
  sendgrid_configured: boolean; sendgrid_sender: string; twilio_configured: boolean;
};

export default function ContactDelivery({ I }: { I: Record<string, any> }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ sender: '', sendgrid_key: '', twilio_sid: '', twilio_token: '', twilio_service: '' });
  const [flow, setFlow] = useState(contactHandoff.gmail);
  const readView = () => new URLSearchParams(window.location.search).get('delivery') || (contactHandoff.gmail ? 'gmail' : 'sendgrid');
  const [view, setView] = useState(readView);
  const active = useRef(true);
  const sequence = useRef(0);
  const token = I.v3.state.token;
  const provider = I.v3.readToken()?.provider;
  const api = `${window.location.protocol}//${provider}${window.location.port ? ':' + window.location.port : ''}`;

  async function post(path: string, body = {}) {
    return (await axios.post(`${api}/admin/contact/${path}`, { token, ...body })).data;
  }
  async function action(path: string, body = {}, success = '') {
    const request = ++sequence.current;
    setBusy(true); setError(''); setMessage('');
    console.log('[auth-ui] contact delivery action started', { action: path });
    try {
      const result = await post(path, body);
      if (!active.current || request !== sequence.current) return;
      console.log('[auth-ui] contact delivery action completed', { action: path });
      setMessage(success);
      return result;
    } catch {
      if (active.current && request === sequence.current) {
        setError('Could not complete delivery setup. Check the API configuration and try again.');
        console.warn('[auth-ui] contact delivery action failed', { action: path });
      }
    } finally {
      if (active.current && request === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    active.current = true;
    action('status').then(result => {
      if (result && active.current) {
        setStatus(result); setForm(previous => ({ ...previous, sender: result.sendgrid_sender || '' }));
      }
    });
    const sync = () => setView(readView());
    window.addEventListener('popstate', sync);
    return () => { active.current = false; ++sequence.current; window.removeEventListener('popstate', sync); };
  }, []);

  function select(next: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'config');
    url.searchParams.set('delivery', next);
    window.history.pushState(window.history.state, '', url);
    setView(next);
  }
  async function connect() {
    const result = await action('gmail/start');
    if (!result) return;
    const destination = new URL(result.url);
    if (destination.origin !== 'https://accounts.google.com') { setError('Invalid Google connection destination.'); return; }
    sessionStorage.setItem('web10-gmail-flow', JSON.stringify({ flow: result.flow, api }));
    window.location.assign(destination.href);
  }
  async function finish() {
    let pending;
    try { pending = JSON.parse(sessionStorage.getItem('web10-gmail-flow') || '{}'); } catch { pending = {}; }
    if (pending.flow !== flow || pending.api !== api) {
      setError('This Gmail connection belongs to another tab or node. Please connect again.'); return;
    }
    const result = await action('gmail/finish', { flow }, 'Gmail connected. Select “Use Gmail” to enable email delivery.');
    if (result) { setStatus(result); setFlow(''); contactHandoff.gmail = ''; sessionStorage.removeItem('web10-gmail-flow'); }
  }
  async function save(selected: string) {
    const result = await action('configure', { provider: selected, ...(selected === 'sendgrid' ? form : {}) }, 'Delivery settings saved. Send a test email to check your inbox.');
    if (result) {
      setStatus(result);
      setForm(previous => ({ ...previous, sendgrid_key: '', twilio_token: '' }));
    }
  }
  const field = (name: keyof typeof form, label: string, secret = false, placeholder = '') => (
    <div>
      <Label htmlFor={`delivery-${name}`} className="mb-1 block text-muted-foreground">{label}</Label>
      {secret ? <SecretInput id={`delivery-${name}`} label={label} value={form[name]} disabled={busy}
        placeholder={placeholder} onChange={e => setForm({ ...form, [name]: e.target.value })} data-testid={`delivery-${name}`} />
        : <Input id={`delivery-${name}`} value={form[name]} disabled={busy} placeholder={placeholder}
          onChange={e => setForm({ ...form, [name]: e.target.value })} data-testid={`delivery-${name}`} />}
    </div>
  );
  return (
    <Card data-testid="contact-delivery-card">
      <CardHeader>
        <CardTitle>Email &amp; account recovery</CardTitle>
        <p className="text-sm text-muted-foreground">Verification codes and password-reset links, sent from your node’s support email. Users can have any email provider.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2" aria-label="Delivery setup options">
          {([['sendgrid', 'API credentials', 'SendGrid email + Twilio SMS', Server], ['gmail', 'Gmail (optional)', 'Existing support-mailbox connection', Mail]] as const).map(([value, title, subtitle, Icon]) => (
            <button key={value} type="button" aria-pressed={view === value} onClick={() => select(value)}
              className={`min-h-24 rounded border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view === value ? 'border-brand bg-brand-muted' : 'border-border hover:bg-elevated'}`}>
              <Icon className="mb-2 h-5 w-5 text-brand-300" strokeWidth={1.5} />
              <span className="block text-sm font-semibold">{title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{subtitle}</span>
            </button>
          ))}
        </div>
        {!status && !error && <Skeleton className="h-24 w-full" />}
        {error && <div role="alert" className="rounded border border-danger bg-danger-muted p-3 text-sm text-danger">{error}<Button variant="outline" size="sm" className="ml-2" disabled={busy} onClick={() => action('status').then(result => result && setStatus(result))}>Retry</Button></div>}
        {message && <p role="status" className="text-sm text-success">{message}</p>}
        {status && <>
          {!status.available && <div className="rounded border border-border bg-elevated p-3 text-sm text-muted-foreground">Delivery setup is not enabled on this API yet. Configure its private state bucket, encryption key and authenticator URL using the advanced instructions below. Existing delivery is unchanged.</div>}
          <p className="text-xs text-muted-foreground">Active email delivery: <span className="font-medium text-foreground">{status.email_provider === 'legacy' ? 'Existing Twilio Verify setup' : status.email_provider === 'gmail' ? 'Gmail' : 'SendGrid'}</span></p>
          {view === 'gmail' ? <div className="space-y-4" data-testid="delivery-gmail-panel">
            <p className="text-sm text-muted-foreground">Use a dedicated Gmail or Google Workspace mailbox for a small community. Allow sending only—we never request inbox access. Gmail sending limits apply.</p>
            <p className="break-all text-sm">{status.gmail_connected ? <><Check className="mr-1 inline h-4 w-4 text-success" />Connected: {status.gmail_sender}</> : 'No Gmail mailbox connected'}</p>
            {flow && <Button disabled={busy || !status.available} onClick={finish}>Finish connecting Gmail</Button>}
            <div className="flex flex-wrap gap-2">
              <Button variant="brand" disabled={busy || !status.gmail_available} onClick={connect}><span className="mr-2 font-semibold" aria-hidden="true">G</span>{status.gmail_connected ? 'Reconnect Gmail' : 'Connect Gmail'}</Button>
              {status.gmail_connected && <>
                <Button variant="outline" disabled={busy} onClick={() => save('gmail')}>Use Gmail</Button>
                <Button variant="outline" disabled={busy} onClick={() => action('test', { provider: 'gmail' }, 'Test submitted to Gmail. Check the connected mailbox; inbox delivery is not guaranteed.')}>Send test email</Button>
                <Button variant="ghost" disabled={busy} onClick={() => action('gmail/disconnect', {}, 'Gmail disconnected from this node.').then(result => result && setStatus(result))}>Disconnect</Button>
              </>}
            </div>
            {!status.gmail_available && <p className="text-xs text-muted-foreground">The API operator must configure Google OAuth first. Independent self-hosters use their own Google client; no shared web10 secret is bundled.</p>}
          </div> : <div className="space-y-4" data-testid="delivery-sendgrid-panel">
            <p className="text-sm text-muted-foreground">SendGrid sends email codes and password-reset links. Add Twilio Verify if you also want SMS codes. Either option can be used by any node size.</p>
            <p className="text-sm">Email: {status.sendgrid_configured ? 'Configured — test delivery below' : 'Not configured'} · SMS: {status.twilio_configured ? 'Configured' : 'Using existing Twilio setup, if configured'}</p>
            <div className="rounded border border-border bg-elevated/40 p-4">
              <p className="text-sm font-medium">Get your SendGrid credentials</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Create a restricted API key with Mail Send permission, then verify the sender address or domain you will use below. Paste the key here and save; opening these links does not connect the provider.</p>
              <div className="mt-2 flex flex-col items-start">
                <ProviderSetupLink href="https://app.sendgrid.com/settings/api_keys">Create a SendGrid API key</ProviderSetupLink>
                <ProviderSetupLink href="https://app.sendgrid.com/settings/sender_auth">Verify a SendGrid sender or domain</ProviderSetupLink>
              </div>
            </div>
            {field('sender', 'Verified SendGrid sender email', false, 'support@your-domain.com')}
            {field('sendgrid_key', 'SendGrid API key', true, status.sendgrid_configured ? 'Saved — leave blank to keep' : 'Mail Send permission only')}
            <details className="rounded border border-border p-3">
              <summary className="min-h-11 cursor-pointer text-sm font-medium text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Optional SMS · Twilio Verify</summary>
              <div className="mt-3 space-y-3"><TwilioCredentialHelp />{field('twilio_sid', 'Twilio Account SID')}{field('twilio_token', 'Twilio Auth Token', true, 'Leave blank to keep saved token')}{field('twilio_service', 'Twilio Verify Service SID')}</div>
            </details>
            <div className="flex flex-wrap gap-2">
              <Button variant="brand" disabled={busy || !status.available} onClick={() => save('sendgrid')}>Save &amp; use SendGrid</Button>
              <Button variant="outline" disabled={busy || !status.sendgrid_configured} onClick={() => action('test', { provider: 'sendgrid' }, 'Test submitted to SendGrid. Check the sender’s inbox; inbox delivery is not guaranteed.')}>Send test email</Button>
            </div>
            <p className="text-xs text-muted-foreground">Verify your sender/domain in SendGrid first. Stored keys are never returned to this screen. Save changes before testing.</p>
          </div>}
        </>}
        <details className="border-t border-border pt-3">
          <summary className="min-h-11 cursor-pointer text-sm text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Advanced · API setup &amp; delivery limits</summary>
          <div className="mt-2 space-y-2 break-words text-xs leading-relaxed text-muted-foreground">
            <p>On the API: provision a separate private CONTACT_DELIVERY_STATE_BUCKET with conditional writes. Set CONTACT_DELIVERY_KEY to a persistent Fernet key and CONTACT_AUTH_URL to this authenticator’s HTTPS root URL. Never use your JWT signing key.</p>
            <p>For Gmail: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REDIRECT_URI. Register the exact callback https://YOUR_API/admin/contact/gmail/callback with Google. Request email sending only; public use requires Google OAuth approval. Keep these credentials on the server.</p>
            <p>Email challenges expire in 10 minutes. The initial email limit is 100 sends/hour per node and five/hour per address; Gmail/SendGrid may impose lower limits. Disconnected or failed delivery never bypasses verification. Removing Gmail here stops this node using its token; Google account permissions can also be revoked in Google.</p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
