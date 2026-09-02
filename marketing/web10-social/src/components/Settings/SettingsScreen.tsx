import { useState, useEffect } from 'react';
import { getWapi } from '@/data/wapi';
import { readSettings, saveSettings, type AppSettings } from '@/data/settings';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Settings as SettingsIcon, User, Database, Info, LogOut, ExternalLink, Shield, Bug, Eye, Lock, Loader2, Zap } from 'lucide-react';

const APP_VERSION = import.meta.env?.VITE_GIT_COMMIT || '0.1.0';
const AUTH_ORIGIN = import.meta.env?.VITE_AUTH_ORIGIN || 'https://auth.web10.app';

function Section({ title, icon: Icon, children }: { title: string; icon: typeof SettingsIcon; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <p className="text-sm text-muted-foreground shrink-0 font-mono">{value}</p>
    </div>
  );
}

function LinkRow({ label, description, href, onClick }: { label: string; description?: string; href?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-elevated/50 transition-colors duration-150"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.5} />
    </button>
  );
}

function PostingDefaultsSection({ settings, onSave }: { settings: AppSettings; onSave: (s: Partial<AppSettings>) => void }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(v: 'public' | 'private') {
    setSaving(true);
    setSaved(false);
    await onSave({ defaultVisibility: v });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Section title="Posting Defaults" icon={Eye}>
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Choose the default visibility for new posts. You can still change it per post in the composer.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleSave('public')}
            disabled={saving}
            data-testid="settings-visibility-public"
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded text-sm font-medium border transition-colors duration-150',
              settings.defaultVisibility === 'public'
                ? 'bg-brand-muted border-brand/30 text-foreground'
                : 'bg-transparent border-border text-muted-foreground hover:text-foreground hover:bg-elevated',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Eye className="w-4 h-4" strokeWidth={1.75} />
            Public
          </button>
          <button
            type="button"
            onClick={() => handleSave('private')}
            disabled={saving}
            data-testid="settings-visibility-private"
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded text-sm font-medium border transition-colors duration-150',
              settings.defaultVisibility === 'private'
                ? 'bg-brand-muted border-brand/30 text-foreground'
                : 'bg-transparent border-border text-muted-foreground hover:text-foreground hover:bg-elevated',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <Lock className="w-4 h-4" strokeWidth={1.75} />
            Private
          </button>
        </div>
        {saving && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-brand" />
            Saving…
          </p>
        )}
        {saved && (
          <p className="text-xs text-success" role="status">Saved.</p>
        )}
      </div>
    </Section>
  );
}

function RealTimeSection({ settings, onSave }: { settings: AppSettings; onSave: (s: Partial<AppSettings>) => void }) {
  const [saving, setSaving] = useState(false);
  const enabled = settings.p2pEnabled ?? true;

  async function handleToggle() {
    setSaving(true);
    const next = !enabled;
    try {
      await onSave({ p2pEnabled: next });
      // Tell the app to (re)apply the P2P peer for the new setting.
      window.dispatchEvent(new CustomEvent('settings-changed', { detail: { p2pEnabled: next } }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Real-time Messages" icon={Zap}>
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">Deliver messages instantly</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            When on, messages are delivered in real time over a peer-to-peer
            connection while you're both online, and you show as online. When
            off, messages still work — just on your next read, with no real-time
            nudge.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={saving}
          onClick={handleToggle}
          data-testid="settings-p2p-toggle"
          className={cn(
            'relative shrink-0 w-11 h-6 rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
            enabled ? 'bg-success' : 'bg-muted-foreground/30',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150',
              enabled ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>
      {saving && (
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin text-brand" />
            Updating…
          </p>
        </div>
      )}
    </Section>
  );
}

export default function SettingsScreen({ onLogout, onReportBug }: { onLogout: () => void; onReportBug: () => void }) {
  const token = getWapi().readToken();
  const username = token?.username || '';
  const provider = token?.provider || '';

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    readSettings()
      .then((s) => {
        setSettings(s);
      })
      .catch(() => {})
      .finally(() => setSettingsLoading(false));
  }, []);

  async function handleSaveSettings(partial: Partial<AppSettings>) {
    const saved = await saveSettings(partial);
    setSettings(saved);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-6 h-6 text-foreground" strokeWidth={1.75} />
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Settings</h1>
      </div>

      <Section title="Account" icon={User}>
        <Row
          label="Username"
          value={username}
          description="Your unique identifier on this node"
        />
        <Row
          label="Provider"
          value={provider}
          description="The identity provider verifying your account"
        />
        <LinkRow
          label="Edit profile"
          description="Avatar, banner, display name, bio"
          href="/profile"
        />
        <div className="px-4 py-3">
          <Button
            variant="outline"
            data-testid="settings-logout-button"
            className="w-full gap-2 text-muted-foreground hover:text-foreground"
            onClick={onLogout}
          >
            <LogOut className="w-4 h-4" strokeWidth={1.75} />
            Log out
          </Button>
        </div>
      </Section>

      {!settingsLoading && settings && (
        <PostingDefaultsSection settings={settings} onSave={handleSaveSettings} />
      )}

      {!settingsLoading && settings && (
        <RealTimeSection settings={settings} onSave={handleSaveSettings} />
      )}

      <Section title="Your Data" icon={Database}>
        <div className="px-4 py-3 space-y-2">
          <p className="text-sm text-foreground">
            Your data lives in your own database collections. Each record belongs to you, not the platform.
          </p>
          <p className="text-xs text-muted-foreground">
            Apps access your data through scoped, expiring tokens. You control which apps can read or write each collection.
          </p>
        </div>
        <LinkRow
          label="Manage app access"
          description="Review and revoke app permissions"
          href={`${AUTH_ORIGIN}/contracts`}
        />
        <LinkRow
          label="Export your data"
          description="Download everything in one archive"
          href="/import"
        />
      </Section>

      <Section title="About" icon={Info}>
        <Row
          label="Version"
          value={APP_VERSION}
        />
        <div className="px-4 py-3 space-y-2">
          <Button
            variant="outline"
            data-testid="settings-report-bug-button"
            className="w-full gap-2 text-muted-foreground hover:text-foreground"
            onClick={onReportBug}
          >
            <Bug className="w-4 h-4" strokeWidth={1.75} />
            Report a bug
          </Button>
          <a
            href="https://web10.app/manifesto"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-brand-300 hover:text-brand-400 transition-colors duration-150"
          >
            <Shield className="w-4 h-4" strokeWidth={1.75} />
            Read the manifesto
            <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
          </a>
        </div>
      </Section>
    </div>
  );
}
