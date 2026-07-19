import React from 'react';
import axios from 'axios';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    <div className="mb-8 flex justify-center gap-2" data-testid="wizard-step-indicator">
      {STEPS.slice(0, total).map((step, i) => (
        <div
          key={step}
          title={step}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-colors',
            i <= current ? 'bg-brand text-brand-foreground' : 'bg-elevated text-muted-foreground',
          )}
        >
          {i < current ? <Check className="h-4 w-4" strokeWidth={2} /> : i + 1}
        </div>
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <h1 className="mb-4 font-display text-3xl font-bold text-foreground">Welcome to web10</h1>
      <p className="mx-auto mb-8 max-w-[500px] leading-relaxed text-muted-foreground">
        Set up your sovereign social node in a few minutes.
        Your node stores your data, runs your apps, and belongs to you.
      </p>
      <div className="flex justify-center">
        <Button variant="brand" size="lg" data-testid="wizard-welcome-get-started" onClick={onNext}>
          Get Started
        </Button>
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
      <h2 className="mb-6 text-center font-display text-xl font-medium text-foreground">Node Identity</h2>
      <div className="mx-auto max-w-[400px] space-y-4">
        <div>
          <Label className="mb-1 block text-muted-foreground">Provider Domain</Label>
          <Input
            value={data.provider}
            onChange={e => onChange("provider", e.target.value)}
            placeholder="api.example.com"
            data-testid="wizard-provider-domain"
          />
          <p className="mt-1 text-xs text-muted-foreground">The domain your node will be reachable at</p>
        </div>

        <div>
          <Label className="mb-1 block text-muted-foreground">Brand Name</Label>
          <Input
            value={data.brand_text}
            onChange={e => onChange("brand_text", e.target.value)}
            placeholder="web10"
            data-testid="wizard-brand-name"
          />
        </div>

        <div>
          <Label className="mb-1 block text-muted-foreground">Database URL</Label>
          <Input
            value={data.db_url}
            onChange={e => onChange("db_url", e.target.value)}
            placeholder="mongodb://ferretdb:27017"
            data-testid="wizard-db-url"
          />
          <p className="mt-1 text-xs text-muted-foreground">MongoDB or FerretDB connection string</p>
        </div>
      </div>
      <div className="mt-8 flex justify-center gap-2">
        <Button variant="outline" data-testid="wizard-node-identity-back" onClick={onBack}>
          Back
        </Button>
        <Button variant="brand" data-testid="wizard-node-identity-next" onClick={onNext} disabled={!data.provider}>
          Next
        </Button>
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
      <h2 className="mb-6 text-center font-display text-xl font-medium text-foreground">Admin Account</h2>
      <div className="mx-auto max-w-[400px] space-y-4">
        <div>
          <Label className="mb-1 block text-muted-foreground">Username</Label>
          <Input
            value={data.admin_username}
            onChange={e => onChange("admin_username", e.target.value)}
            placeholder="admin"
            data-testid="wizard-admin-username"
          />
        </div>

        <div>
          <Label className="mb-1 block text-muted-foreground">Password</Label>
          <Input
            type="password"
            value={data.admin_password}
            onChange={e => onChange("admin_password", e.target.value)}
            placeholder="••••••••"
            data-testid="wizard-admin-password"
          />
        </div>

        <div>
          <Label className="mb-1 block text-muted-foreground">Confirm Password</Label>
          <Input
            type="password"
            value={data.admin_password_confirm}
            onChange={e => onChange("admin_password_confirm", e.target.value)}
            placeholder="••••••••"
            data-testid="wizard-admin-password-confirm"
          />
          {data.admin_password_confirm && !passwordsMatch && (
            <p className="mt-1 text-xs text-danger" data-testid="wizard-password-mismatch">Passwords do not match</p>
          )}
        </div>
      </div>
      <div className="mt-8 flex justify-center gap-2">
        <Button variant="outline" data-testid="wizard-admin-account-back" onClick={onBack}>
          Back
        </Button>
        <Button
          variant="brand"
          data-testid="wizard-admin-account-next"
          onClick={onNext}
          disabled={!data.admin_username || !data.admin_password || !passwordsMatch}
        >
          Next
        </Button>
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
      <h2 className="mb-6 text-center font-display text-xl font-medium text-foreground">Access Policy</h2>
      <div className="mx-auto max-w-[500px]">
        <p className="mb-6 text-center text-muted-foreground">
          Control who can join your node and how.
        </p>

        <div className="flex items-center justify-between border-b border-border py-3">
          <div>
            <div className="text-sm font-medium text-foreground">Beta Code Required</div>
            <div className="text-xs text-muted-foreground">Users need a valid beta code to sign up</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={data.beta_required} onChange={() => toggle("beta_required")} data-testid="wizard-toggle-beta-required" />
            <span className="slider round"></span>
          </label>
        </div>

        {data.beta_required && (
          <div className="mb-2 mt-3 pl-5">
            <Label className="mb-1 block text-muted-foreground">Beta Code</Label>
            <Input
              value={data.beta_code}
              onChange={e => onChange("beta_code", e.target.value)}
              placeholder="web10betacode"
              data-testid="wizard-beta-code"
            />
          </div>
        )}

        <div className="flex items-center justify-between border-b border-border py-3">
          <div>
            <div className="text-sm font-medium text-foreground">Phone Verification</div>
            <div className="text-xs text-muted-foreground">Require phone number on signup</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={data.verify_required} onChange={() => toggle("verify_required")} data-testid="wizard-toggle-verify-required" />
            <span className="slider round"></span>
          </label>
        </div>

        <div className="flex items-center justify-between border-b border-border py-3">
          <div>
            <div className="text-sm font-medium text-foreground">Payment Required</div>
            <div className="text-xs text-muted-foreground">Users must subscribe to use the node</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={data.pay_required} onChange={() => toggle("pay_required")} data-testid="wizard-toggle-pay-required" />
            <span className="slider round"></span>
          </label>
        </div>

        <div className="mt-5">
          <Label className="mb-1 block text-muted-foreground">Free Credits / Month</Label>
          <Input
            type="number"
            value={data.free_credits}
            onChange={e => onChange("free_credits", parseFloat(e.target.value) || 0)}
            data-testid="wizard-free-credits"
          />
        </div>

        <div className="mt-4">
          <Label className="mb-1 block text-muted-foreground">Free Space (MB) / Month</Label>
          <Input
            type="number"
            value={data.free_space}
            onChange={e => onChange("free_space", parseInt(e.target.value) || 0)}
            data-testid="wizard-free-space"
          />
        </div>
      </div>
      <div className="mt-8 flex justify-center gap-2">
        <Button variant="outline" data-testid="wizard-access-policy-back" onClick={onBack}>
          Back
        </Button>
        <Button variant="brand" data-testid="wizard-access-policy-next" onClick={onNext}>
          Next
        </Button>
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
      <h2 className="mb-6 text-center font-display text-xl font-medium text-foreground">Media Storage</h2>
      <div className="mx-auto max-w-[500px]">
        <p className="mb-6 text-center text-muted-foreground">
          Configure S3-compatible storage for media files.
          MinIO is included by default for self-hosting.
        </p>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-muted-foreground">S3 Endpoint</Label>
            <Input
              value={data.s3_endpoint}
              onChange={e => onChange("s3_endpoint", e.target.value)}
              placeholder="http://minio:9000"
              data-testid="wizard-s3-endpoint"
            />
          </div>

          <div>
            <Label className="mb-1 block text-muted-foreground">Bucket Name</Label>
            <Input
              value={data.s3_bucket}
              onChange={e => onChange("s3_bucket", e.target.value)}
              placeholder="web10-media"
              data-testid="wizard-s3-bucket"
            />
          </div>

          <div>
            <Label className="mb-1 block text-muted-foreground">Access Key</Label>
            <Input
              value={data.s3_access_key}
              onChange={e => onChange("s3_access_key", e.target.value)}
              placeholder="minioadmin"
              data-testid="wizard-s3-access-key"
            />
          </div>

          <div>
            <Label className="mb-1 block text-muted-foreground">Secret Key</Label>
            <Input
              type="password"
              value={data.s3_secret_key}
              onChange={e => onChange("s3_secret_key", e.target.value)}
              placeholder="minioadmin"
              data-testid="wizard-s3-secret-key"
            />
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-brand-300" data-testid="wizard-advanced-twilio">Advanced: Twilio (SMS)</summary>
            <div className="mt-2 space-y-3">
              <div>
                <Label className="mb-1 block text-muted-foreground">Twilio Service SID</Label>
                <Input value={data.twilio_service} onChange={e => onChange("twilio_service", e.target.value)} data-testid="wizard-twilio-service" />
              </div>
              <div>
                <Label className="mb-1 block text-muted-foreground">Account SID</Label>
                <Input value={data.twilio_account_sid} onChange={e => onChange("twilio_account_sid", e.target.value)} data-testid="wizard-twilio-account-sid" />
              </div>
              <div>
                <Label className="mb-1 block text-muted-foreground">Auth Token</Label>
                <Input type="password" value={data.twilio_auth_token} onChange={e => onChange("twilio_auth_token", e.target.value)} data-testid="wizard-twilio-auth-token" />
              </div>
              <div>
                <Label className="mb-1 block text-muted-foreground">Phone Number</Label>
                <Input value={data.twilio_number} onChange={e => onChange("twilio_number", e.target.value)} placeholder="+1234567890" data-testid="wizard-twilio-number" />
              </div>
            </div>
          </details>

          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-brand-300" data-testid="wizard-advanced-stripe">Advanced: Stripe (Payments)</summary>
            <div className="mt-2 space-y-3">
              <div>
                <Label className="mb-1 block text-muted-foreground">Test API Key</Label>
                <Input type="password" value={data.stripe_test_key} onChange={e => onChange("stripe_test_key", e.target.value)} data-testid="wizard-stripe-test-key" />
              </div>
              <div>
                <Label className="mb-1 block text-muted-foreground">Live API Key</Label>
                <Input type="password" value={data.stripe_live_key} onChange={e => onChange("stripe_live_key", e.target.value)} data-testid="wizard-stripe-live-key" />
              </div>
            </div>
          </details>
        </div>
      </div>
      <div className="mt-8 flex justify-center gap-2">
        <Button variant="outline" data-testid="wizard-storage-back" onClick={onBack}>
          Back
        </Button>
        <Button variant="brand" data-testid="wizard-storage-next" onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}

function CompleteStep({ message, error, onLogin }: { message: string; error: string | null; onLogin: () => void }) {
  return (
    <div className="text-center">
      <h2 className={cn('mb-4 font-display text-3xl font-bold', error ? 'text-danger' : 'text-success')}>
        {error ? "Setup Failed" : "You're All Set!"}
      </h2>
      <p className="mx-auto mb-8 max-w-[500px] leading-relaxed text-muted-foreground">
        {error || message || "Your node is configured and ready to use."}
      </p>
      <div className="flex justify-center">
        <Button variant="brand" size="lg" data-testid="wizard-complete-login" onClick={onLogin}>
          Go to Login
        </Button>
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
    <div className="flex min-h-screen flex-col bg-background text-foreground" data-testid="setup-wizard">
      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center px-5 py-16">
        <div className="mb-2 flex justify-center">
          <img
            src={I.logo}
            alt="web10"
            className="mb-5 h-10"
          />
        </div>
        {!done && step > 0 && step < 6 && (
          <StepIndicator current={step} total={6} />
        )}
        {loading ? (
          <div className="py-10 text-center" data-testid="wizard-loading">
            <div className="text-lg text-muted-foreground">Configuring your node…</div>
          </div>
        ) : (
          renderStep()
        )}
      </div>
    </div>
  );
}

export default SetupWizard;
