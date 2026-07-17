import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import BioBottom from '../components/Bio/BioBottom';
import { createMockI } from './mockAppInterface';

describe('BioBottom', () => {
  it('shows settings and delete contact only in bio mode', () => {
    const I = createMockI({ mode: 'bio' });
    const { container } = render(<BioBottom I={I} />);
    expect(container.textContent).toContain('settings');
    expect(container.textContent).toContain('delete contact');
  });

  it('hides settings and delete contact in other modes', () => {
    const I = createMockI({ mode: 'my-bio' });
    const { container } = render(<BioBottom I={I} />);
    expect(container.textContent).not.toContain('settings');
    expect(container.textContent).not.toContain('delete contact');
  });

  it('does not delete when safety input is empty', () => {
    const deleteCurrentContact = vi.fn();
    const I = createMockI({ mode: 'bio', deleteCurrentContact });
    render(<BioBottom I={I} />);
    const link = document.querySelector('a') as HTMLElement;
    if (link) link.click();
    expect(deleteCurrentContact).not.toHaveBeenCalled();
  });

  it('does not delete when safety input is wrong value', () => {
    const deleteCurrentContact = vi.fn();
    const I = createMockI({ mode: 'bio', deleteCurrentContact });
    render(<BioBottom I={I} />);
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wrong' } });
    const link = document.querySelector('a') as HTMLElement;
    if (link) link.click();
    expect(deleteCurrentContact).not.toHaveBeenCalled();
  });

  it('calls deleteCurrentContact when safety input is "delete"', () => {
    const deleteCurrentContact = vi.fn();
    const I = createMockI({ mode: 'bio', deleteCurrentContact });
    render(<BioBottom I={I} />);
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'delete' } });
    const links = document.querySelectorAll('a');
    const deleteLink = Array.from(links).find((l) => l.textContent?.includes('delete contact'));
    if (deleteLink) fireEvent.click(deleteLink);
    expect(deleteCurrentContact).toHaveBeenCalled();
  });
});
