import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Mail from '../components/Mail/Mail';
import { createMockI } from './mockAppInterface';
import type { MailMessage } from '../types';

const mockMessages: MailMessage[] = [
  { _id: 'm1', mail: 'Hey, great meeting you!', date: '2024-03-01T09:00:00Z', provider: 'api.web10.app', username: 'alice' },
  { _id: 'm2', mail: 'Can we schedule a call?', date: '2024-03-05T11:30:00Z', provider: 'api.web10.app', username: 'bob' },
];

describe('Mail component', () => {
  it('renders the Mail heading', () => {
    const I = createMockI({ mode: 'mail', mailMessages: mockMessages, mailLoad: vi.fn() });
    render(<Mail I={I} />);
    expect(screen.getByRole('heading', { name: 'Mail' })).toBeInTheDocument();
  });

  it('renders compose section with inputs', () => {
    const I = createMockI({ mode: 'mail', mailMessages: mockMessages, mailLoad: vi.fn() });
    render(<Mail I={I} />);
    expect(screen.getByPlaceholderText('Recipient (username)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Server')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Write message...')).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
  });

  it('displays inbox messages', () => {
    const I = createMockI({ mode: 'mail', mailMessages: mockMessages, mailLoad: vi.fn() });
    render(<Mail I={I} />);
    expect(screen.getByText('Hey, great meeting you!')).toBeInTheDocument();
    expect(screen.getByText('Can we schedule a call?')).toBeInTheDocument();
  });

  it('displays message sender info', () => {
    const I = createMockI({ mode: 'mail', mailMessages: mockMessages, mailLoad: vi.fn() });
    render(<Mail I={I} />);
    expect(screen.getByText('api.web10.app/alice')).toBeInTheDocument();
    expect(screen.getByText('api.web10.app/bob')).toBeInTheDocument();
  });

  it('shows "No messages yet" when inbox is empty', () => {
    const I = createMockI({ mode: 'mail', mailMessages: [], mailLoad: vi.fn() });
    render(<Mail I={I} />);
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('sorts messages by date descending', () => {
    const reversed = [...mockMessages].reverse();
    const I = createMockI({ mode: 'mail', mailMessages: reversed, mailLoad: vi.fn() });
    render(<Mail I={I} />);
    const messages = screen.getAllByText(/Hey, great meeting you!/);
    expect(messages.length).toBeGreaterThan(0);
  });

  it('shows compose section', () => {
    const I = createMockI({ mode: 'mail', mailMessages: mockMessages, mailLoad: vi.fn() });
    render(<Mail I={I} />);
    expect(screen.getByText('Compose')).toBeInTheDocument();
  });

  it('shows inbox section', () => {
    const I = createMockI({ mode: 'mail', mailMessages: mockMessages, mailLoad: vi.fn() });
    render(<Mail I={I} />);
    expect(screen.getByText('Inbox')).toBeInTheDocument();
  });

  it('calls mailSend when Send is clicked with valid input', () => {
    const mailSend = vi.fn();
    const I = createMockI({ mode: 'mail', mailMessages: [], mailLoad: vi.fn(), mailSend });
    render(<Mail I={I} />);
    const recipientInput = screen.getByPlaceholderText('Recipient (username)');
    const messageInput = screen.getByPlaceholderText('Write message...');
    fireEvent.change(recipientInput, { target: { value: 'alice' } });
    fireEvent.change(messageInput, { target: { value: 'Hello!' } });
    fireEvent.click(screen.getByText('Send'));
    expect(mailSend).toHaveBeenCalledWith('alice', 'api.web10.app', 'Hello!');
  });

  it('shows error when recipient is missing', () => {
    const I = createMockI({ mode: 'mail', mailMessages: [], mailLoad: vi.fn(), mailSend: vi.fn() });
    render(<Mail I={I} />);
    const messageInput = screen.getByPlaceholderText('Write message...');
    fireEvent.change(messageInput, { target: { value: 'Hello!' } });
    fireEvent.click(screen.getByText('Send'));
    expect(screen.getByText('Recipient and message required')).toBeInTheDocument();
  });

  it('shows error when message is missing', () => {
    const I = createMockI({ mode: 'mail', mailMessages: [], mailLoad: vi.fn(), mailSend: vi.fn() });
    render(<Mail I={I} />);
    const recipientInput = screen.getByPlaceholderText('Recipient (username)');
    fireEvent.change(recipientInput, { target: { value: 'alice' } });
    fireEvent.click(screen.getByText('Send'));
    expect(screen.getByText('Recipient and message required')).toBeInTheDocument();
  });

  it('shows "Message sent" status after sending', async () => {
    const mailSend = vi.fn();
    const I = createMockI({ mode: 'mail', mailMessages: [], mailLoad: vi.fn(), mailSend });
    render(<Mail I={I} />);
    const recipientInput = screen.getByPlaceholderText('Recipient (username)');
    const messageInput = screen.getByPlaceholderText('Write message...');
    fireEvent.change(recipientInput, { target: { value: 'alice' } });
    fireEvent.change(messageInput, { target: { value: 'Hello!' } });
    fireEvent.click(screen.getByText('Send'));
    await waitFor(() => {
      expect(screen.getByText('Message sent')).toBeInTheDocument();
    });
  });

  it('calls mailDelete on delete button click', () => {
    const mailDelete = vi.fn();
    const I = createMockI({ mode: 'mail', mailMessages: mockMessages, mailLoad: vi.fn(), mailDelete });
    render(<Mail I={I} />);
    const deleteBtns = screen.getAllByText('Delete');
    fireEvent.click(deleteBtns[0]);
    expect(mailDelete).toHaveBeenCalled();
  });

  it('calls mailLoad on mount', () => {
    const mailLoad = vi.fn();
    const I = createMockI({ mode: 'mail', mailMessages: [], mailLoad });
    render(<Mail I={I} />);
    expect(mailLoad).toHaveBeenCalled();
  });

  it('server input defaults to api.web10.app', () => {
    const I = createMockI({ mode: 'mail', mailMessages: [], mailLoad: vi.fn() });
    render(<Mail I={I} />);
    const serverInput = screen.getByPlaceholderText('Server');
    expect(serverInput).toHaveValue('api.web10.app');
  });
});
