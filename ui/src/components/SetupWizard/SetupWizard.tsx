import React from 'react';
import axios from 'axios';

const STEPS = [
  "Welcome",
  "Node Identity",
  "Admin Account",
  "Access Policy",
  "Storage",
  "Complete",
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2 mb-8 justify-center">
      {STEPS.slice(0, total).map((step, i) => (
        <div
          key={i}
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all"
          style={{
            background: i < current ? 'var(--color-primary-600)' : i === current ? 'var(--color-primary-600)' : 'var(--color-neutral-700)',
            color: '#fff',
          }}
        >
          {i < current ? '✓' : i + 1}
        </div>
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <h1 className="text-3xl font-bold mb-4" style={{ color: 'var(--color-text)' }}>Welcome to web10</h1>
      <p className="max-w-[500px] mx-auto mb-8 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        Set up your sovereign social node in a few minutes.
        Your node stores your data, runs your apps, and belongs to you.
      </p>
      <div className="flex justify-center">
        <button
          className="px-10 py-3 text-base font-semibold rounded-lg text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary-600)' }}
          onClick={onNext}
        >
          Get Started
        </button>
      </div>
    </div>
  );
}

function NodeIdentityStep({ data, onChange, onNext, onBack }: {
  data: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 text-center" style={{ color: 'var(--color-text)' }}>Node Identity</h2>
      <div className="max-w-[400px] mx-auto space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Provider Domain</label>
          <input
            className="w-full px-3 py-2 rounded-lg border text-base"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            value={data.provider}
            onChange={e => onChange("provider", e.target.value)}
            placeholder="api.example.com"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>The domain your node will be reachable at</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Brand Name</label>
          <input
            className="w-full px-3 py-2 rounded-lg border text-base"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            value={data.brand_text}
            onChange={e => onChange("brand_text", e.target.value)}
            placeholder="web10"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Database URL</label>
          <input
            className="w-full px-3 py-2 rounded-lg border text-base"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            value={data.db_url}
            onChange={e => onChange("db_url", e.target.value)}
            placeholder="mongodb://ferretdb:27017"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>MongoDB or FerretDB connection string</p>
        </div>
      </div>
      <div className="flex justify-center gap-2 mt-8">
        <button
          className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary-600)' }}
          onClick={onNext}
          disabled={!data.provider}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function AdminAccountStep({ data, onChange, onNext, onBack }: {
  data: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const passwordsMatch = data.admin_password === data.admin_password_confirm;
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 text-center" style={{ color: 'var(--color-text)' }}>Admin Account</h2>
      <div className="max-w-[400px] mx-auto space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Username</label>
          <input
            className="w-full px-3 py-2 rounded-lg border text-base"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            value={data.admin_username}
            onChange={e => onChange("admin_username", e.target.value)}
            placeholder="admin"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Password</label>
          <input
            className="w-full px-3 py-2 rounded-lg border text-base"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            type="password"
            value={data.admin_password}
            onChange={e => onChange("admin_password", e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Confirm Password</label>
          <input
            className="w-full px-3 py-2 rounded-lg border text-base"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            type="password"
            value={data.admin_password_confirm}
            onChange={e => onChange("admin_password_confirm", e.target.value)}
            placeholder="••••••••"
          />
          {data.admin_password_confirm && !passwordsMatch && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>Passwords do not match</p>
          )}
        </div>
      </div>
      <div className="flex justify-center gap-2 mt-8">
        <button
          className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary-600)' }}
          onClick={onNext}
          disabled={!data.admin_username || !data.admin_password || !passwordsMatch}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function AccessPolicyStep({ data, onChange, onNext, onBack }: {
  data: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const toggle = (key: string) => onChange(key, !data[key]);
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 text-center" style={{ color: 'var(--color-text)' }}>Access Policy</h2>
      <div className="max-w-[500px] mx-auto">
        <p className="text-center mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Control who can join your node and how.
        </p>

        <div className="flex justify-between items-center py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <div className="font-medium">Beta Code Required</div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Users need a valid beta code to sign up</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={data.beta_required} onChange={() => toggle("beta_required")} />
            <span className="slider round"></span>
          </label>
        </div>

        {data.beta_required && (
          <div className="pl-5 mb-2 mt-3">
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Beta Code</label>
            <input
              className="w-full px-3 py-2 rounded-lg border text-base"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              value={data.beta_code}
              onChange={e => onChange("beta_code", e.target.value)}
              placeholder="web10betacode"
            />
          </div>
        )}

        <div className="flex justify-between items-center py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <div className="font-medium">Phone Verification</div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Require phone number on signup</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={data.verify_required} onChange={() => toggle("verify_required")} />
            <span className="slider round"></span>
          </label>
        </div>

        <div className="flex justify-between items-center py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <div className="font-medium">Payment Required</div>
            <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Users must subscribe to use the node</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={data.pay_required} onChange={() => toggle("pay_required")} />
            <span className="slider round"></span>
          </label>
        </div>

        <div className="mt-5">
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Free Credits / Month</label>
          <input
            className="w-full px-3 py-2 rounded-lg border text-base"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            type="number"
            value={data.free_credits}
            onChange={e => onChange("free_credits", parseFloat(e.target.value) || 0)}
          />
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Free Space (MB) / Month</label>
          <input
            className="w-full px-3 py-2 rounded-lg border text-base"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
            type="number"
            value={data.free_space}
            onChange={e => onChange("free_space", parseInt(e.target.value) || 0)}
          />
        </div>
      </div>
      <div className="flex justify-center gap-2 mt-8">
        <button
          className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary-600)' }}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function StorageStep({ data, onChange, onNext, onBack }: {
  data: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-6 text-center" style={{ color: 'var(--color-text)' }}>Media Storage</h2>
      <div className="max-w-[500px] mx-auto">
        <p className="text-center mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Configure S3-compatible storage for media files.
          MinIO is included by default for self-hosting.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>S3 Endpoint</label>
            <input
              className="w-full px-3 py-2 rounded-lg border text-base"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              value={data.s3_endpoint}
              onChange={e => onChange("s3_endpoint", e.target.value)}
              placeholder="http://minio:9000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Bucket Name</label>
            <input
              className="w-full px-3 py-2 rounded-lg border text-base"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              value={data.s3_bucket}
              onChange={e => onChange("s3_bucket", e.target.value)}
              placeholder="web10-media"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Access Key</label>
            <input
              className="w-full px-3 py-2 rounded-lg border text-base"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              value={data.s3_access_key}
              onChange={e => onChange("s3_access_key", e.target.value)}
              placeholder="minioadmin"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Secret Key</label>
            <input
              className="w-full px-3 py-2 rounded-lg border text-base"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }}
              type="password"
              value={data.s3_secret_key}
              onChange={e => onChange("s3_secret_key", e.target.value)}
              placeholder="minioadmin"
            />
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium" style={{ color: 'var(--color-primary-600)' }}>Advanced: Twilio (SMS)</summary>
            <div className="mt-2 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Twilio Service SID</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={data.twilio_service} onChange={e => onChange("twilio_service", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Account SID</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={data.twilio_account_sid} onChange={e => onChange("twilio_account_sid", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Auth Token</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="password" value={data.twilio_auth_token} onChange={e => onChange("twilio_auth_token", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Phone Number</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} value={data.twilio_number} onChange={e => onChange("twilio_number", e.target.value)} placeholder="+1234567890" />
              </div>
            </div>
          </details>

          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium" style={{ color: 'var(--color-primary-600)' }}>Advanced: Stripe (Payments)</summary>
            <div className="mt-2 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Test API Key</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="password" value={data.stripe_test_key} onChange={e => onChange("stripe_test_key", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Live API Key</label>
                <input className="w-full px-3 py-2 rounded-lg border text-base" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }} type="password" value={data.stripe_live_key} onChange={e => onChange("stripe_live_key", e.target.value)} />
              </div>
            </div>
          </details>
        </div>
      </div>
      <div className="flex justify-center gap-2 mt-8">
        <button
          className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          onClick={onBack}
        >
          Back
        </button>
        <button
          className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary-600)' }}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function CompleteStep({ message, error, onLogin }: { message: string; error: string | null; onLogin: () => void }) {
  return (
    <div className="text-center">
      <h2 className="mb-4 text-3xl font-bold" style={{ color: error ? 'var(--color-danger)' : 'var(--color-success)' }}>
        {error ? "Setup Failed" : "You're All Set!"}
      </h2>
      <p className="max-w-[500px] mx-auto mb-8 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
        {error || message || "Your node is configured and ready to use."}
      </p>
      <div className="flex justify-center">
        <button
          className="px-10 py-3 text-base font-semibold rounded-lg text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: 'var(--color-primary-600)' }}
          onClick={onLogin}
        >
          Go to Login
        </button>
      </div>
    </div>
  );
}

function SetupWizard({ I }: { I: Record<string, any> }) {
  const [step, setStep] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
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

  const onChange = (key: string, value: any) => setFormData(prev => ({ ...prev, [key]: value }));

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
    } catch (e: any) {
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
    <div className={`min-h-screen flex flex-col ${I.theme === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}>
      <div className="max-w-[600px] mx-auto px-5 py-16 flex-1 flex flex-col justify-center">
        <div className="flex justify-center mb-2">
          <img
            src={I.logo}
            alt="web10"
            className="h-10 mb-5"
          />
        </div>
        {!done && step > 0 && step < 6 && (
          <StepIndicator current={step} total={6} />
        )}
        {loading ? (
          <div className="text-center py-10">
            <div className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>Configuring your node...</div>
          </div>
        ) : (
          renderStep()
        )}
      </div>
    </div>
  );
}

export default SetupWizard;