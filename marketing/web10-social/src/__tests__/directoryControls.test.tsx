import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { DirectoryControls } from '@web10/discover/directory-controls';
import type { SourceEditorControl } from '@web10/discover/source-controls';
import '@testing-library/jest-dom';

const control: SourceEditorControl = { home: 'https://home.example', scope: 'public', sources: [{ origin: 'https://home.example', weight: 100 }], approved: new Set(['https://home.example']), ready: true, busy: false, error: '', canEdit: true, requiresApproval: false, save: vi.fn(), approve: vi.fn(), reload: vi.fn() };
function Harness() {
  const location = useLocation(), navigate = useNavigate();
  const kind = new URLSearchParams(location.search).get('section') === 'groups' ? 'groups' : 'profiles';
  return <><DirectoryControls kind={kind} control={control} onRetry={vi.fn()} /><output>{location.search}</output><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate('?section=groups&peopleSort=newest&q=hello')}>Groups</button></>;
}
describe('directory controls', () => {
  it('consecutive fader edits preserve each other before source props commit', () => {
    const save = vi.fn();
    const two = { ...control, save, sources: [...control.sources, { origin: 'https://other.example', weight: 100 }], approved: new Set(['https://home.example', 'https://other.example']) };
    render(<MemoryRouter initialEntries={['/people?tune=1']}><DirectoryControls kind="profiles" control={two} onRetry={vi.fn()} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Fetch weight for home.example'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Fetch weight for other.example'), { target: { value: '0' } });
    expect(save).toHaveBeenLastCalledWith([{ origin: 'https://home.example', weight: 0 }, { origin: 'https://other.example', weight: 0 }], undefined, true);
  });
  it('independent URL-owned sorts preserve search and restore with history; there are no ranking knobs', () => {
    render(<MemoryRouter initialEntries={['/people?q=hello']}><Harness /></MemoryRouter>);
    expect(screen.getByRole('group', { name: 'Sort profiles' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Most followers' })).toBeChecked();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Newest' }));
    expect(screen.getByRole('status')).toHaveTextContent('q=hello&peopleSort=newest');
    fireEvent.click(screen.getByText('Groups'));
    expect(screen.getByRole('group', { name: 'Sort groups' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Most members' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Newest' }));
    expect(screen.getByRole('status')).toHaveTextContent('peopleSort=newest');
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByRole('radio', { name: 'Most members' })).toBeChecked();
    expect(screen.queryByTestId('knob-rack')).not.toBeInTheDocument();
  });

  it('selects popularity directly and removes only its own default sort parameter', () => {
    render(<MemoryRouter initialEntries={['/people?q=hello&peopleSort=newest&groupSort=newest&tune=1']}><Harness /></MemoryRouter>);
    expect(screen.getByRole('radio', { name: 'Newest' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Most followers' }));
    expect(screen.getByRole('radio', { name: 'Most followers' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('q=hello&groupSort=newest&tune=1');
    expect(screen.getByRole('status')).not.toHaveTextContent('peopleSort');
  });

  it('uses only two compact sort choices, without a dial or dropdown', () => {
    render(<MemoryRouter initialEntries={['/people?q=hello']}><Harness /></MemoryRouter>);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByTestId('directory-sort-selector').querySelector('svg, select, button')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Newest' }));
    expect(screen.getByRole('radio', { name: 'Newest' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Most followers' }));
    expect(screen.getByRole('radio', { name: 'Most followers' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('?q=hello');
    expect(screen.getByRole('status')).not.toHaveTextContent('peopleSort');
  });

  it('uses the existing URL-owned server editor and actual fader save callback', () => {
    render(<MemoryRouter initialEntries={['/people']}><Harness /></MemoryRouter>);
    expect(screen.getByTestId('directory-advanced-panel')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('directory-advanced-panel').firstElementChild).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(screen.getByRole('button', { name: 'Hide controls' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('tune=1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit servers' }));
    expect(screen.getByRole('status')).toHaveTextContent('editServers=1');
    expect(screen.getByLabelText('Server API URL')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Server API URL')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide controls' }));
    expect(screen.getByRole('button', { name: 'Advanced' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('directory-advanced-panel')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('directory-advanced-panel').firstElementChild).toHaveAttribute('inert');
    expect(screen.getByRole('status')).not.toHaveTextContent('tune=1');
  });
});
