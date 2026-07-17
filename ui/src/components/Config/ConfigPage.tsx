import React from 'react';
import axios from 'axios';
import { R, C } from 'rectangles-npm';
import TopBar from '../shared/TopBar';
import SideBar from '../shared/SideBar';

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #333" }}>
      <div>
        <div style={{ fontWeight: "bold" }}>{label}</div>
        <div style={{ color: "#888", fontSize: "13px" }}>{description}</div>
      </div>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="slider round"></span>
      </label>
    </div>
  );
}

function ConfigSection({ title, children }) {
  return (
    <R t style={{ marginBottom: "30px" }}>
      <h3 style={{ marginBottom: "16px", borderBottom: "1px solid #333", paddingBottom: "8px" }}>{title}</h3>
      {children}
    </R>
  );
}

function ConfigPage({ I }) {
  const [config, setConfig] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
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
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to load config. Are you an admin?");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadConfig();
  }, []);

  const updateField = (key, value) => {
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
      for (const key of Object.keys(config)) {
        payload[key] = config[key];
      }

      await axios.patch(
        `${protocol}//${provider}/config`,
        { token, ...payload },
        { headers: { "Content-Type": "application/json" } }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <R root t bt bb br bl theme={I.theme}>
        <TopBar I={I} />
        <C t style={{ padding: "40px", color: "#aaa" }}>Loading config...</C>
      </R>
    );
  }

  if (error && !config) {
    return (
      <R root t bt bb br bl theme={I.theme}>
        <TopBar I={I} />
        <C t style={{ padding: "40px", color: "#ff4444" }}>{error}</C>
      </R>
    );
  }

  return (
    <R root t bt bb br bl theme={I.theme}>
      <style>{`
        .switch {
          position: relative;
          display: inline-block;
          width: 50px;
          height: 26px;
        }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #444;
          transition: 0.3s;
        }
        .slider.round { border-radius: 26px; }
        .slider:before {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        }
        input:checked + .slider { background-color: #0066ff; }
        input:checked + .slider:before { transform: translateX(24px); }
      `}</style>
      <TopBar I={I} />
      <R l tel>
        <SideBar I={I} />
        <R t tel style={{ padding: "20px", maxWidth: "700px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ margin: 0 }}>Node Configuration</h2>
            <div>
              {saved && (
                <span style={{ color: "#00cc66", marginRight: "10px" }}>✓ Saved</span>
              )}
              <button
                className="button is-primary"
                onClick={saveConfig}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          {error && (
            <div className="notification is-danger" style={{ marginBottom: "16px" }}>{error}</div>
          )}

          <ConfigSection title="Node Identity">
            <label className="label">Provider Domain</label>
            <input className="input" value={config?.provider || ""} onChange={e => updateField("provider", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Brand Name</label>
            <input className="input" value={config?.brand_text || ""} onChange={e => updateField("brand_text", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>CORS Service Managers</label>
            <input className="input" value={config?.cors_service_managers || ""} onChange={e => updateField("cors_service_managers", e.target.value)} />
            <p className="help">Comma-separated list of allowed authenticator domains</p>

            <label className="label" style={{ marginTop: "16px" }}>Token Expiry (minutes)</label>
            <input className="input" type="number" value={config?.token_expire_minutes || 87840} onChange={e => updateField("token_expire_minutes", parseInt(e.target.value) || 0)} />
          </ConfigSection>

          <ConfigSection title="Access Policy">
            <ToggleRow
              label="Beta Code Required"
              description="Users need a valid beta code to sign up"
              checked={config?.beta_required || false}
              onChange={() => updateField("beta_required", !config?.beta_required)}
            />
            {config?.beta_required && (
              <R t style={{ paddingLeft: "20px", marginBottom: "10px" }}>
                <label className="label">Beta Code</label>
                <input className="input" value={config?.beta_code || ""} onChange={e => updateField("beta_code", e.target.value)} />
              </R>
            )}
            <ToggleRow
              label="Phone Verification"
              description="Require phone number on signup"
              checked={config?.verify_required || false}
              onChange={() => updateField("verify_required", !config?.verify_required)}
            />
            <ToggleRow
              label="Payment Required"
              description="Users must subscribe to use the node"
              checked={config?.pay_required || false}
              onChange={() => updateField("pay_required", !config?.pay_required)}
            />
          </ConfigSection>

          <ConfigSection title="Free Tier Defaults">
            <label className="label">Free Credits / Month</label>
            <input className="input" type="number" step="0.01" value={config?.free_credits || 0.10} onChange={e => updateField("free_credits", parseFloat(e.target.value) || 0)} />

            <label className="label" style={{ marginTop: "16px" }}>Free Space (MB) / Month</label>
            <input className="input" type="number" value={config?.free_space || 8} onChange={e => updateField("free_space", parseInt(e.target.value) || 0)} />
          </ConfigSection>

          <ConfigSection title="Media Storage (S3)">
            <label className="label">S3 Endpoint</label>
            <input className="input" value={config?.s3_endpoint || ""} onChange={e => updateField("s3_endpoint", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Bucket Name</label>
            <input className="input" value={config?.s3_bucket || ""} onChange={e => updateField("s3_bucket", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Access Key</label>
            <input className="input" value={config?.s3_access_key || ""} onChange={e => updateField("s3_access_key", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Secret Key</label>
            <input className="input" type="password" value={config?.s3_secret_key || ""} onChange={e => updateField("s3_secret_key", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Region</label>
            <input className="input" value={config?.s3_region || "us-east-1"} onChange={e => updateField("s3_region", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Max Upload Size (bytes)</label>
            <input className="input" type="number" value={config?.max_upload_size || 524288000} onChange={e => updateField("max_upload_size", parseInt(e.target.value) || 0)} />
          </ConfigSection>

          <ConfigSection title="Twilio (SMS Verification)">
            <label className="label">Service SID</label>
            <input className="input" value={config?.twilio_service || ""} onChange={e => updateField("twilio_service", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Account SID</label>
            <input className="input" value={config?.twilio_account_sid || ""} onChange={e => updateField("twilio_account_sid", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Auth Token</label>
            <input className="input" type="password" value={config?.twilio_auth_token || ""} onChange={e => updateField("twilio_auth_token", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Phone Number</label>
            <input className="input" value={config?.twilio_number || ""} onChange={e => updateField("twilio_number", e.target.value)} />
          </ConfigSection>

          <ConfigSection title="Stripe (Payments)">
            <label className="label">Mode</label>
            <div className="select is-fullwidth">
              <select value={config?.stripe_status || "test"} onChange={e => updateField("stripe_status", e.target.value)}>
                <option value="test">Test</option>
                <option value="live">Live</option>
              </select>
            </div>

            <label className="label" style={{ marginTop: "16px" }}>Test API Key</label>
            <input className="input" type="password" value={config?.stripe_test_key || ""} onChange={e => updateField("stripe_test_key", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Live API Key</label>
            <input className="input" type="password" value={config?.stripe_live_key || ""} onChange={e => updateField("stripe_live_key", e.target.value)} />

            <label className="label" style={{ marginTop: "16px" }}>Dev Pay Split (%)</label>
            <input className="input" type="number" value={config?.dev_pay_pct || 98} onChange={e => updateField("dev_pay_pct", parseInt(e.target.value) || 98)} />
            <p className="help">Percentage of revenue that goes to the developer</p>
          </ConfigSection>
        </R>
      </R>
    </R>
  );
}

export default ConfigPage;