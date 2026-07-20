import React from 'react';
import axios from 'axios';
import AppShell from '../shared/AppShell';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, UserPlus, X } from 'lucide-react';

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

function ConfigPage({ I }: { I: Record<string, any> }) {
  const [config, setConfig] = React.useState<Record<string, any> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const loadConfig = async () => {
    try {
      const token = I.wapi.token;
      const decoded = I.wapi.readToken();
      const provider = decoded.provider;
      const protocol = window.location.protocol;

      const resp = await axios.post(
        `${protocol}//${provider}/config`,
        { token },
        { headers: { "Content-Type": "application/json" } }
      );
      setConfig(resp.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load config. Are you an admin?");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (I.isAdmin) loadConfig();
    else setLoading(false);
  }, [I.isAdmin]);

  const [newAdmin, setNewAdmin] = React.useState("");
  const admins: string[] = config?.admins || [];

  const saveAdmins = async (next: string[]) => {
    setSaving(true);
    setError(null);
    try {
      const token = I.wapi.token;
      const provider = I.wapi.readToken().provider;
      const protocol = window.location.protocol;
      await axios.patch(
        `${protocol}//${provider}/config`,
        { token, admins: next },
        { headers: { "Content-Type": "application/json" } }
      );
      setConfig(prev => ({ ...prev, admins: next }));
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

  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = I.wapi.token;
      const decoded = I.wapi.readToken();
      const provider = decoded.provider;
      const protocol = window.location.protocol;

      const payload = {};
      for (const key of Object.keys(config || {})) {
        (payload as any)[key] = (config as any)[key];
      }

      await axios.patch(
        `${protocol}//${provider}/config`,
        { token, ...payload },
        { headers: { "Content-Type": "application/json" } }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to save config");
    } finally {
      setSaving(false);
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
              <Field label="CORS Service Managers" description="Comma-separated list of allowed authenticator domains">
                <Input value={config?.cors_service_managers || ""} onChange={e => updateField("cors_service_managers", e.target.value)} data-testid="config-cors" />
              </Field>
              <Field label="Token Expiry (minutes)">
                <Input type="number" value={config?.token_expire_minutes || 87840} onChange={e => updateField("token_expire_minutes", parseInt(e.target.value) || 0)} data-testid="config-token-expiry" />
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
