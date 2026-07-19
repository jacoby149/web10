import React from 'react';
import axios from 'axios';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';

function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: () => void;
}) {
  return (
    <div className="flex justify-between items-center py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{description}</div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="slider round"></span>
      </label>
    </div>
  );
}

function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h3 className="font-semibold mb-4 pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>{title}</h3>
      {children}
    </div>
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
    loadConfig();
  }, []);

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

  if (loading) {
    return (
      <div className={`min-h-screen flex flex-col ${I.theme === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
        <TopBar I={I} />
        <div className="flex items-center justify-center py-10">
          <div style={{ color: 'var(--color-text-secondary)' }}>Loading config...</div>
        </div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className={`min-h-screen flex flex-col ${I.theme === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
        <TopBar I={I} />
        <div className="flex items-center justify-center py-10">
          <div style={{ color: 'var(--color-danger)' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${I.theme === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
      <TopBar I={I} />
      <div className="flex flex-1 overflow-auto">
        <SideBar I={I} />
        <div className="flex-1 p-6 overflow-auto max-w-[700px]">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-xl font-semibold m-0">Node Configuration</h2>
            <div className="flex items-center gap-3">
              {saved && <span className="text-sm" style={{ color: 'var(--color-success)' }}>✓ Saved</span>}
              <button
                className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary-600)' }}
                onClick={saveConfig}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 mb-4 rounded-lg text-sm" style={{ backgroundColor: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>{error}</div>
          )}

          <ConfigSection title="Node Identity">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Provider Domain</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.provider || ""} onChange={e => updateField("provider", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Brand Name</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.brand_text || ""} onChange={e => updateField("brand_text", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>CORS Service Managers</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.cors_service_managers || ""} onChange={e => updateField("cors_service_managers", e.target.value)} />
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Comma-separated list of allowed authenticator domains</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Token Expiry (minutes)</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="number" value={config?.token_expire_minutes || 87840} onChange={e => updateField("token_expire_minutes", parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </ConfigSection>

          <ConfigSection title="Access Policy">
            <ToggleRow label="Beta Code Required" description="Users need a valid beta code to sign up" checked={config?.beta_required || false} onChange={() => updateField("beta_required", !config?.beta_required)} />
            {config?.beta_required && (
              <div className="pl-5 mb-2 mt-3">
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Beta Code</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.beta_code || ""} onChange={e => updateField("beta_code", e.target.value)} />
              </div>
            )}
            <ToggleRow label="Phone Verification" description="Require phone number on signup" checked={config?.verify_required || false} onChange={() => updateField("verify_required", !config?.verify_required)} />
            <ToggleRow label="Payment Required" description="Users must subscribe to use the node" checked={config?.pay_required || false} onChange={() => updateField("pay_required", !config?.pay_required)} />
          </ConfigSection>

          <ConfigSection title="Free Tier Defaults">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Free Credits / Month</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="number" step="0.01" value={config?.free_credits || 0.10} onChange={e => updateField("free_credits", parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Free Space (MB) / Month</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="number" value={config?.free_space || 8} onChange={e => updateField("free_space", parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </ConfigSection>

          <ConfigSection title="Media Storage (S3)">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>S3 Endpoint</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.s3_endpoint || ""} onChange={e => updateField("s3_endpoint", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Bucket Name</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.s3_bucket || ""} onChange={e => updateField("s3_bucket", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Access Key</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.s3_access_key || ""} onChange={e => updateField("s3_access_key", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Secret Key</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="password" value={config?.s3_secret_key || ""} onChange={e => updateField("s3_secret_key", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Region</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.s3_region || "us-east-1"} onChange={e => updateField("s3_region", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Max Upload Size (bytes)</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="number" value={config?.max_upload_size || 524288000} onChange={e => updateField("max_upload_size", parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </ConfigSection>

          <ConfigSection title="Twilio (SMS Verification)">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Service SID</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.twilio_service || ""} onChange={e => updateField("twilio_service", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Account SID</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.twilio_account_sid || ""} onChange={e => updateField("twilio_account_sid", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Auth Token</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="password" value={config?.twilio_auth_token || ""} onChange={e => updateField("twilio_auth_token", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Phone Number</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.twilio_number || ""} onChange={e => updateField("twilio_number", e.target.value)} />
              </div>
            </div>
          </ConfigSection>

          <ConfigSection title="Stripe (Payments)">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Mode</label>
                <select className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={config?.stripe_status || "test"} onChange={e => updateField("stripe_status", e.target.value)}>
                  <option value="test">Test</option>
                  <option value="live">Live</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Test API Key</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="password" value={config?.stripe_test_key || ""} onChange={e => updateField("stripe_test_key", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Live API Key</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="password" value={config?.stripe_live_key || ""} onChange={e => updateField("stripe_live_key", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Dev Pay Split (%)</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="number" value={config?.dev_pay_pct || 98} onChange={e => updateField("dev_pay_pct", parseInt(e.target.value) || 98)} />
                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Percentage of revenue that goes to the developer</p>
              </div>
            </div>
          </ConfigSection>
        </div>
      </div>
    </div>
  );
}

export default ConfigPage;