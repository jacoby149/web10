import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContactAdder from '../components/Contacts/ContactAdder';
import type { Contact } from '../types';
import { createMockI } from './mockAppInterface';

describe('ContactAdder', () => {
  it('shows default "add a contact" text when no search', () => {
    const I = createMockI();
    render(<ContactAdder I={I} />);
    expect(screen.getByText('To Add A Contact')).toBeInTheDocument();
  });

  it('shows "add {user}" when search has text', () => {
    const I = createMockI({ search: 'alice' });
    render(<ContactAdder I={I} />);
    expect(screen.getByText(/add api\.web10\.app\/alice/)).toBeInTheDocument();
  });

  it('uses search as-is when it already contains a slash', () => {
    const I = createMockI({ search: 'provider/bob' });
    render(<ContactAdder I={I} />);
    expect(screen.getByText(/add provider\/bob/)).toBeInTheDocument();
  });

  it('calls addContact on click', () => {
    const addContact = vi.fn();
    const I = createMockI({ addContact });
    render(<ContactAdder I={I} />);
    const wrapper = screen.getByText('To Add A Contact').closest('div')?.parentElement;
    fireEvent.click(wrapper!);
    expect(addContact).toHaveBeenCalled();
  });

  it('shows search contact name when available', () => {
    const contact: Contact = {
      web10: 'test/alice',
      name: 'Alice',
      pic: '/pic.png',
      bio: 'test',
    };
    const I = createMockI({ search: 'alice', searchContact: contact });
    render(<ContactAdder I={I} />);
    expect(screen.getByText(/on web10 social/)).toBeInTheDocument();
  });
});
