import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import ContactDelivery from '../components/Config/ContactDelivery';
import { SecretInput } from '../components/ui/secret-input';
import ConfigPage from '../components/Config/ConfigPage';
import ForgotForm from '../components/CredentialPage/ForgotForm';
import { contactHandoff } from '../lib/contactHandoff';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));
const I = { isAdmin: true, v3: { state: { token: 'synthetic-admin' }, readToken: () => ({ provider: 'api.localhost' }) } };
const status = { available: true, gmail_available: true, gmail_connected: false, gmail_sender: '',
  sendgrid_configured: false, sendgrid_sender: '', twilio_configured: false, email_provider: 'legacy' };

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/?mode=config');
  contactHandoff.recovery = ''; contactHandoff.gmail = '';
  vi.mocked(axios.post).mockResolvedValue({ data: status });
});

describe('Node delivery settings', () => {
  it('defaults to credential setup and retains URL-backed optional Gmail selection', async () => {
    render(<ContactDelivery I={I} />);
    expect(await screen.findByTestId('delivery-sendgrid-panel')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Gmail \(optional\)/ }));
    expect(await screen.findByRole('button', { name: 'Connect Gmail' })).toBeEnabled();
    expect(window.location.search).toContain('delivery=gmail');
    fireEvent.click(screen.getByRole('button', { name: /API credentials/ }));
    expect(screen.getByTestId('delivery-sendgrid-panel')).toBeVisible();
    expect(window.location.search).toContain('delivery=sendgrid');
    expect(screen.getByTestId('delivery-sendgrid_key')).toHaveAttribute('type', 'password');
    fireEvent.change(screen.getByTestId('delivery-sender'), { target: { value: 'support@example.com' } });
    fireEvent.change(screen.getByTestId('delivery-sendgrid_key'), { target: { value: 'synthetic-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save & use SendGrid' }));
    await waitFor(() => expect(vi.mocked(axios.post)).toHaveBeenCalledWith(expect.stringContaining('/configure'), {
      token: 'synthetic-admin', provider: 'sendgrid', sender: 'support@example.com', sendgrid_key: 'synthetic-key',
      twilio_sid: '', twilio_token: '', twilio_service: '',
    }));
    await waitFor(() => expect(screen.getByTestId('delivery-sendgrid_key')).toHaveValue(''));
  });

  it('does not fake a Gmail connection when API prerequisites are missing', async () => {
    window.history.replaceState(null, '', '/?mode=config&delivery=gmail');
    vi.mocked(axios.post).mockResolvedValue({ data: { ...status, available: false, gmail_available: false } });
    render(<ContactDelivery I={I} />);
    expect(await screen.findByRole('button', { name: 'Connect Gmail' })).toBeDisabled();
    expect(screen.getByText(/not enabled on this API/)).toBeVisible();
  });

  it('supports testing and disconnect, without returning stored secrets', async () => {
    window.history.replaceState(null, '', '/?mode=config&delivery=gmail');
    vi.mocked(axios.post).mockResolvedValue({ data: { ...status, gmail_connected: true, gmail_sender: 'support@example.com' } });
    render(<ContactDelivery I={I} />);
    const test = await screen.findByRole('button', { name: 'Send test email' });
    fireEvent.click(test);
    await screen.findByText(/Test submitted to Gmail/);
    expect(vi.mocked(axios.post)).toHaveBeenCalledWith(expect.stringContaining('/test'), { token: 'synthetic-admin', provider: 'gmail' });
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await screen.findByText('Gmail disconnected from this node.');
    expect(vi.mocked(axios.post)).toHaveBeenCalledWith(expect.stringContaining('/disconnect'), { token: 'synthetic-admin' });
  });

  it('sanitizes setup failures and allows retry', async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error('private-provider-secret'));
    render(<ContactDelivery I={I} />);
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private-provider-secret');
    vi.mocked(axios.post).mockResolvedValue({ data: status });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('delivery-sendgrid-panel')).toBeVisible();
  });

  it('links directly to official credential pages without exposing the portal URL or credentials', async () => {
    render(<ContactDelivery I={I} />);
    await screen.findByTestId('delivery-sendgrid-panel');
    const expected = [
      ['Create a SendGrid API key', 'https://app.sendgrid.com/settings/api_keys'],
      ['Verify a SendGrid sender or domain', 'https://app.sendgrid.com/settings/sender_auth'],
      ['Get Twilio Account SID & Auth Token', 'https://console.twilio.com/'],
      ['Get Twilio Verify Service SID', 'https://console.twilio.com/us1/develop/verify/services'],
    ];
    fireEvent.click(screen.getByText('Optional SMS · Twilio Verify'));
    for (const [name, href] of expected) {
      const link = screen.getByRole('link', { name: `${name} (opens in a new tab)` });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
    }
    expect(screen.getByText(/These fields do not accept an API key SID/)).toBeVisible();
    expect(screen.getByTestId('delivery-twilio_token')).toHaveAttribute('type', 'password');
    expect(vi.mocked(axios.post)).toHaveBeenCalledTimes(1); // status read only
  });

  it('keeps pending Gmail handoffs reachable despite the credential-first default', async () => {
    contactHandoff.gmail = 'synthetic-pending-flow';
    render(<ContactDelivery I={I} />);
    expect(await screen.findByRole('button', { name: 'Finish connecting Gmail' })).toBeVisible();
  });

  it('uses the selected PostHog region and asks for the public project token, not an admin key', async () => {
    vi.mocked(axios.post).mockImplementation(async url => ({ data: String(url).endsWith('/config')
      ? { admins: ['admin'], posthog_host: 'https://us.i.posthog.com' }
      : String(url).endsWith('/status') ? status : { apps: [] } }));
    render(<ConfigPage I={I} />);
    const link = await screen.findByTestId('config-posthog-key-link');
    expect(link).toHaveAttribute('href', 'https://us.posthog.com/project/settings');
    fireEvent.change(screen.getByTestId('config-posthog-host'), { target: { value: 'https://eu.i.posthog.com' } });
    expect(link).toHaveAttribute('href', 'https://eu.posthog.com/project/settings');
    expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByText(/Do not create or paste a personal API key/)).toBeVisible();
    expect(vi.mocked(axios.post).mock.calls.some(([url]) => String(url).endsWith('/config/update'))).toBe(false);
  });
});

describe('Screen-recording-safe secret fields', () => {
  it('masks by default, explicitly reveals, and remasks on leaving the field', () => {
    render(<SecretInput label="Storage secret" value="synthetic-secret" readOnly />);
    const input = screen.getByLabelText('Storage secret');
    expect(input).toHaveAttribute('type', 'password');
    const toggle = screen.getByRole('button', { name: 'Show Storage secret' });
    fireEvent.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.blur(toggle, { relatedTarget: document.body });
    expect(input).toHaveAttribute('type', 'password');
  });

  it('remasks when the window loses focus', () => {
    render(<SecretInput label="API key" defaultValue="synthetic" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show API key' }));
    fireEvent(window, new Event('blur'));
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
  });

  it('masks the real Node Config storage secret, access key and credential-bearing DB URL', async () => {
    vi.mocked(axios.post).mockImplementation(async (url) => ({ data: String(url).endsWith('/config') ? {
      admins: ['admin'], s3_secret_key: 'synthetic-minio-secret', s3_access_key: 'synthetic-access',
      db_url: 'clickhouse://user:synthetic-password@db',
    } : String(url).endsWith('/status') ? status : { apps: [] } }));
    render(<ConfigPage I={I} />);
    expect(await screen.findByTestId('config-s3-secret-key')).toHaveAttribute('type', 'password');
    expect(screen.getByTestId('config-s3-access-key')).toHaveAttribute('type', 'password');
    expect(screen.getByTestId('config-db-url')).toHaveAttribute('type', 'password');
    expect(screen.getByTestId('config-toggle-require-contact')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('config-toggle-require-contact'));
    fireEvent.click(screen.getByTestId('config-save-button'));
    await waitFor(() => expect(vi.mocked(axios.post)).toHaveBeenCalledWith(expect.stringContaining('/config/update'), {
      token: { token: 'synthetic-admin' }, update: { require_contact: true },
    }, expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })));
    fireEvent.click(screen.getByRole('button', { name: 'Show S3 Secret Key' }));
    expect(screen.getByTestId('config-s3-secret-key')).toHaveAttribute('type', 'text');
  });
});

describe('Email password-reset landing', () => {
  it('does not redeem on render, requires confirmation and offers a new code on failure', async () => {
    contactHandoff.recovery = 'synthetic-single-use-link';
    const recoverLink = vi.fn().mockResolvedValue(false);
    const setRecoveryStep = vi.fn();
    render(<ForgotForm I={{ recoveryStep: 'contact', recoverLink, setRecoveryStep }} />);
    expect(recoverLink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('recovery-confirm-link'));
    await waitFor(() => expect(recoverLink).toHaveBeenCalledWith('synthetic-single-use-link'));
    await waitFor(() => expect(screen.getByTestId('recovery-confirm-link')).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Request a new code instead' }));
    expect(screen.getByTestId('recovery-send-code')).toBeVisible();
    expect(setRecoveryStep).toHaveBeenCalledWith('contact');
  });
});
