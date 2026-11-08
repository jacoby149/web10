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
  it('presents small-node Gmail and large-node SendGrid/SMS, with URL-backed selection', async () => {
    render(<ContactDelivery I={I} />);
    expect(await screen.findByRole('button', { name: 'Connect Gmail' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Large nodes/ }));
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
    vi.mocked(axios.post).mockResolvedValue({ data: { ...status, available: false, gmail_available: false } });
    render(<ContactDelivery I={I} />);
    expect(await screen.findByRole('button', { name: 'Connect Gmail' })).toBeDisabled();
    expect(screen.getByText(/not enabled on this API/)).toBeVisible();
  });

  it('supports testing and disconnect, without returning stored secrets', async () => {
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
    expect(await screen.findByRole('button', { name: 'Connect Gmail' })).toBeEnabled();
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
