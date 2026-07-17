import React from 'react';
import axios from 'axios';
import { R, C } from 'rectangles-npm';

const STEPS = [
  "Welcome",
  "Node Identity",
  "Admin Account",
  "Access Policy",
  "Storage",
  "Complete",
];

function StepIndicator({ current, total }) {
  return (
    <div style={{ display: "flex", gap: "8px", marginBottom: "30px", justifyContent: "center" }}>
      {STEPS.slice(0, total).map((step, i) => (
        <div
          key={i}
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: i < current ? "#0066ff" : i === current ? "#0066ff" : "#333",
            color: "#fff",
            fontWeight: "bold",
            fontSize: "14px",
            transition: "all 0.3s",
          }}
        >
          {i < current ? "✓" : i + 1}
        </div>
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }) {
  return (
    <R t>
      <h1 style={{ fontSize: "32px", marginBottom: "16px", textAlign: "center" }}>Welcome to web10</h1>
      <p style={{ textAlign: "center", color: "#aaa", maxWidth: "500px", margin: "0 auto 30px", lineHeight: "1.6" }}>
        Set up your sovereign social node in a few minutes.
        Your node stores your data, runs your apps, and belongs to you.
      </p>
      <C t>
        <button
          className="button is-primary is-large"
          onClick={onNext}
          style={{ padding: "12px 40px", fontSize: "16px" }}
        >
          Get Started
        </button>
      </C>
    </R>
  );
}

function NodeIdentityStep({ data, onChange, onNext, onBack }) {
  return (
    <R t>
      <h2 style={{ marginBottom: "24px", textAlign: "center" }}>Node Identity</h2>
      <R t style={{ maxWidth: "400px", margin: "0 auto" }}>
        <label className="label">Provider Domain</label>
        <input
          className="input"
          value={data.provider}
          onChange={e => onChange("provider", e.target.value)}
          placeholder="api.example.com"
        />
        <p className="help">The domain your node will be reachable at</p>

        <label className="label" style={{ marginTop: "16px" }}>Brand Name</label>
        <input
          className="input"
          value={data.brand_text}
          onChange={e => onChange("brand_text", e.target.value)}
          placeholder="web10"
        />

        <label className="label" style={{ marginTop: "16px" }}>Database URL</label>
        <input
          className="input"
          value={data.db_url}
          onChange={e => onChange("db_url", e.target.value)}
          placeholder="mongodb://ferretdb:27017"
        />
        <p className="help">MongoDB or FerretDB connection string</p>
      </R>
      <C t style={{ marginTop: "30px", gap: "10px" }}>
        <button className="button is-light" onClick={onBack}>Back</button>
        <button
          className="button is-primary"
          onClick={onNext}
          disabled={!data.provider}
        >
          Next
        </button>
      </C>
    </R>
  );
}

function AdminAccountStep({ data, onChange, onNext, onBack }) {
  const passwordsMatch = data.admin_password === data.admin_password_confirm;
  return (
    <R t>
      <h2 style={{ marginBottom: "24px", textAlign: "center" }}>Admin Account</h2>
      <R t style={{ maxWidth: "400px", margin: "0 auto" }}>
        <label className="label">Username</label>
        <input
          className="input"
          value={data.admin_username}
          onChange={e => onChange("admin_username", e.target.value)}
          placeholder="admin"
        />

        <label className="label" style={{ marginTop: "16px" }}>Password</label>
        <input
          className="input"
          type="password"
          value={data.admin_password}
          onChange={e => onChange("admin_password", e.target.value)}
          placeholder="••••••••"
        />

        <label className="label" style={{ marginTop: "16px" }}>Confirm Password</label>
        <input
          className="input"
          type="password"
          value={data.admin_password_confirm}
          onChange={e => onChange("admin_password_confirm", e.target.value)}
          placeholder="••••••••"
        />
        {data.admin_password_confirm && !passwordsMatch && (
          <p className="help" style={{ color: "red" }}>Passwords do not match</p>
        )}
      </R>
      <C t style={{ marginTop: "30px", gap: "10px" }}>
        <button className="button is-light" onClick={onBack}>Back</button>
        <button
          className="button is-primary"
          onClick={onNext}
          disabled={!data.admin_username || !data.admin_password || !passwordsMatch}
        >
          Next
        </button>
      </C>
    </R>
  );
}

function AccessPolicyStep({ data, onChange, onNext, onBack }) {
  const toggle = (key) => onChange(key, !data[key]);
  return (
    <R t>
      <h2 style={{ marginBottom: "24px", textAlign: "center" }}>Access Policy</h2>
      <R t style={{ maxWidth: "500px", margin: "0 auto" }}>
        <p style={{ color: "#aaa", marginBottom: "24px", textAlign: "center" }}>
          Control who can join your node and how.
        </p>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #333" }}>
          <div>
            <div style={{ fontWeight: "bold" }}>Beta Code Required</div>
            <div style={{ color: "#888", fontSize: "13px" }}>Users need a valid beta code to sign up</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={data.beta_required} onChange={() => toggle("beta_required")} />
            <span className="slider round"></span>
          </label>
        </div>

        {data.beta_required && (
          <R t style={{ paddingLeft: "20px", marginBottom: "10px" }}>
            <label className="label">Beta Code</label>
            <input
              className="input"
              value={data.beta_code}
              onChange={e => onChange("beta_code", e.target.value)}
              placeholder="web10betacode"
            />
          </R>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #333" }}>
          <div>
            <div style={{ fontWeight: "bold" }}>Phone Verification</div>
            <div style={{ color: "#888", fontSize: "13px" }}>Require phone number on signup</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={data.verify_required} onChange={() => toggle("verify_required")} />
            <span className="slider round"></span>
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #333" }}>
          <div>
            <div style={{ fontWeight: "bold" }}>Payment Required</div>
            <div style={{ color: "#888", fontSize: "13px" }}>Users must subscribe to use the node</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={data.pay_required} onChange={() => toggle("pay_required")} />
            <span className="slider round"></span>
          </label>
        </div>

        <label className="label" style={{ marginTop: "20px" }}>Free Credits / Month</label>
        <input
          className="input"
          type="number"
          value={data.free_credits}
          onChange={e => onChange("free_credits", parseFloat(e.target.value) || 0)}
        />

        <label className="label" style={{ marginTop: "16px" }}>Free Space (MB) / Month</label>
        <input
          className="input"
          type="number"
          value={data.free_space}
          onChange={e => onChange("free_space", parseInt(e.target.value) || 0)}
        />
      </R>
      <C t style={{ marginTop: "30px", gap: "10px" }}>
        <button className="button is-light" onClick={onBack}>Back</button>
        <button className="button is-primary" onClick={onNext}>Next</button>
      </C>
    </R>
  );
}

function StorageStep({ data, onChange, onNext, onBack }) {
  return (
    <R t>
      <h2 style={{ marginBottom: "24px", textAlign: "center" }}>Media Storage</h2>
      <R t style={{ maxWidth: "500px", margin: "0 auto" }}>
        <p style={{ color: "#aaa", marginBottom: "24px", textAlign: "center" }}>
          Configure S3-compatible storage for media files.
          MinIO is included by default for self-hosting.
        </p>

        <label className="label">S3 Endpoint</label>
        <input
          className="input"
          value={data.s3_endpoint}
          onChange={e => onChange("s3_endpoint", e.target.value)}
          placeholder="http://minio:9000"
        />

        <label className="label" style={{ marginTop: "16px" }}>Bucket Name</label>
        <input
          className="input"
          value={data.s3_bucket}
          onChange={e => onChange("s3_bucket", e.target.value)}
          placeholder="web10-media"
        />

        <label className="label" style={{ marginTop: "16px" }}>Access Key</label>
        <input
          className="input"
          value={data.s3_access_key}
          onChange={e => onChange("s3_access_key", e.target.value)}
          placeholder="minioadmin"
        />

        <label className="label" style={{ marginTop: "16px" }}>Secret Key</label>
        <input
          className="input"
          type="password"
          value={data.s3_secret_key}
          onChange={e => onChange("s3_secret_key", e.target.value)}
          placeholder="minioadmin"
        />

        <details style={{ marginTop: "20px" }}>
          <summary style={{ cursor: "pointer", color: "#0066ff" }}>Advanced: Twilio (SMS)</summary>
          <R t style={{ marginTop: "10px" }}>
            <label className="label">Twilio Service SID</label>
            <input className="input" value={data.twilio_service} onChange={e => onChange("twilio_service", e.target.value)} />
            <label className="label" style={{ marginTop: "12px" }}>Account SID</label>
            <input className="input" value={data.twilio_account_sid} onChange={e => onChange("twilio_account_sid", e.target.value)} />
            <label className="label" style={{ marginTop: "12px" }}>Auth Token</label>
            <input className="input" type="password" value={data.twilio_auth_token} onChange={e => onChange("twilio_auth_token", e.target.value)} />
            <label className="label" style={{ marginTop: "12px" }}>Phone Number</label>
            <input className="input" value={data.twilio_number} onChange={e => onChange("twilio_number", e.target.value)} placeholder="+1234567890" />
          </R>
        </details>

        <details style={{ marginTop: "10px" }}>
          <summary style={{ cursor: "pointer", color: "#0066ff" }}>Advanced: Stripe (Payments)</summary>
          <R t style={{ marginTop: "10px" }}>
            <label className="label">Test API Key</label>
            <input className="input" type="password" value={data.stripe_test_key} onChange={e => onChange("stripe_test_key", e.target.value)} />
            <label className="label" style={{ marginTop: "12px" }}>Live API Key</label>
            <input className="input" type="password" value={data.stripe_live_key} onChange={e => onChange("stripe_live_key", e.target.value)} />
          </R>
        </details>
      </R>
      <C t style={{ marginTop: "30px", gap: "10px" }}>
        <button className="button is-light" onClick={onBack}>Back</button>
        <button className="button is-primary" onClick={onNext}>Next</button>
      </C>
    </R>
  );
}

function CompleteStep({ message, error, onLogin }) {
  return (
    <R t>
      <h2 style={{
        marginBottom: "16px",
        textAlign: "center",
        color: error ? "#ff4444" : "#00cc66",
        fontSize: "36px",
      }}>
        {error ? "Setup Failed" : "You're All Set!"}
      </h2>
      <p style={{ textAlign: "center", color: "#aaa", maxWidth: "500px", margin: "0 auto 30px", lineHeight: "1.6" }}>
        {error || message || "Your node is configured and ready to use."}
      </p>
      <C t>
        <button
          className="button is-primary is-large"
          onClick={onLogin}
          style={{ padding: "12px 40px", fontSize: "16px" }}
        >
          Go to Login
        </button>
      </C>
    </R>
  );
}

function SetupWizard({ I }) {
  const [step, setStep] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [done, setDone] = React.useState(false);

  const [formData, setFormData] = React.useState({
    provider: "api.localhost",
    brand_text: "web10",
    db_url: "mongodb://ferretdb:27017",
    db_name: "web10",
    admin_username: "",
    admin_password: "",
    admin_password_confirm: "",
    beta_required: false,
    verify_required: false,
    pay_required: false,
    beta_code: "web10betacode",
    free_credits: 0.10,
    free_space: 8,
    cors_service_managers: "auth.localhost",
    s3_endpoint: "http://minio:9000",
    s3_bucket: "web10-media",
    s3_access_key: "minioadmin",
    s3_secret_key: "minioadmin",
    twilio_service: "",
    twilio_account_sid: "",
    twilio_auth_token: "",
    twilio_number: "",
    stripe_test_key: "",
    stripe_live_key: "",
  });

  const onChange = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  const nextStep = () => {
    if (step === 5) {
      submitSetup();
    } else {
      setStep(step + 1);
    }
  };

  const submitSetup = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = formData.provider.startsWith("http")
        ? formData.provider
        : `${window.location.protocol}//${formData.provider}`;

      await axios.post(`${provider}/setup`, {
        provider: formData.provider,
        admin_username: formData.admin_username,
        admin_password: formData.admin_password,
        db_url: formData.db_url,
        db_name: formData.db_name,
        brand_text: formData.brand_text,
        beta_required: formData.beta_required,
        verify_required: formData.verify_required,
        pay_required: formData.pay_required,
        beta_code: formData.beta_code,
        free_credits: formData.free_credits,
        free_space: formData.free_space,
        cors_service_managers: formData.cors_service_managers,
        s3_endpoint: formData.s3_endpoint,
        s3_bucket: formData.s3_bucket,
        s3_access_key: formData.s3_access_key,
        s3_secret_key: formData.s3_secret_key,
        twilio_service: formData.twilio_service,
        twilio_account_sid: formData.twilio_account_sid,
        twilio_auth_token: formData.twilio_auth_token,
        twilio_number: formData.twilio_number,
        stripe_test_key: formData.stripe_test_key,
        stripe_live_key: formData.stripe_live_key,
      });

      setDone(true);
      setStep(6);
    } catch (e) {
      setError(e.response?.data?.detail || String(e));
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0: return <WelcomeStep onNext={nextStep} />;
      case 1: return <NodeIdentityStep data={formData} onChange={onChange} onNext={nextStep} onBack={() => setStep(0)} />;
      case 2: return <AdminAccountStep data={formData} onChange={onChange} onNext={nextStep} onBack={() => setStep(1)} />;
      case 3: return <AccessPolicyStep data={formData} onChange={onChange} onNext={nextStep} onBack={() => setStep(2)} />;
      case 4: return <StorageStep data={formData} onChange={onChange} onNext={nextStep} onBack={() => setStep(3)} />;
      case 6: return <CompleteStep message="Node configured successfully." error={error} onLogin={() => I.setMode("login")} />;
      default: return <WelcomeStep onNext={nextStep} />;
    }
  };

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
      <div style={{
        maxWidth: "600px",
        margin: "0 auto",
        padding: "60px 20px",
        minHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}>
        <C t style={{ marginBottom: "10px" }}>
          <img
            src={I.logo}
            alt="web10"
            style={{ height: "40px", marginBottom: "20px" }}
          />
        </C>
        {!done && step > 0 && step < 6 && (
          <StepIndicator current={step} total={6} />
        )}
        {loading ? (
          <C t style={{ padding: "40px", color: "#aaa" }}>
            <div style={{ fontSize: "18px" }}>Configuring your node...</div>
          </C>
        ) : (
          renderStep()
        )}
      </div>
    </R>
  );
}

export default SetupWizard;