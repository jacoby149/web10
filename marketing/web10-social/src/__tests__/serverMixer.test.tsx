import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ServerMixer } from '@/components/Feed/ServerMixer';
import { allocateServerFetches } from '@/lib/serverMixer';

describe('ServerMixer', () => {
  it('renders subscribed destinations and horizontal labeled faders, not fake server options', () => {
    const onChange = vi.fn();
    render(<ServerMixer servers={allocateServerFetches(['https://a.example', 'https://b.example'], {})} onChange={onChange} />);
    expect(screen.getAllByTestId('server-mixer-row')).toHaveLength(2);
    const fader = screen.getByRole('slider', { name: 'Fetch weight for a.example' });
    expect(fader).toHaveAttribute('aria-valuetext', '100 relative weight; 10 posts per page');
    fireEvent.change(fader, { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledWith('https://a.example', 25);
  });
  it('retains muted destinations and shows intentional paused and empty states', () => {
    const { rerender } = render(<ServerMixer servers={allocateServerFetches(['https://a.example'], { 'https://a.example': 0 })} onChange={vi.fn()} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Raise a fader');
    rerender(<ServerMixer servers={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Your subscribed servers will appear here.')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
  it('represents every accepted integer URL weight without browser step rounding', () => {
    render(<ServerMixer servers={allocateServerFetches(['https://a.example'], { 'https://a.example': 1 })} onChange={vi.fn()} />);
    const fader = screen.getByRole('slider', { name: 'Fetch weight for a.example' });
    expect(fader).toHaveAttribute('step', '1');
    expect(fader).toHaveValue('1');
    expect(fader).toHaveAttribute('aria-valuetext', '1 relative weight; 20 posts per page');
  });
});
