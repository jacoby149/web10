import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsScreen from '@/components/Settings/SettingsScreen';

vi.mock('@/data/wapi', () => ({
  getWapi: () => ({ readToken: () => ({ username: 'testuser', provider: 'api.localhost' }) }),
}));
vi.mock('@/data/settings', () => ({
  readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public', p2pEnabled: true }),
  saveSettings: vi.fn(),
}));
vi.mock('@/components/shared/ReportCopyright', () => ({ ReportCopyright: () => null }));

describe('Settings after bulk-import removal (D95)', () => {
  it('keeps account/data controls without the importer or archive upload', async () => {
    const onLogout = vi.fn();
    const { container } = render(<SettingsScreen onLogout={onLogout} onReportBug={vi.fn()} />);
    await screen.findByText('Posting Defaults');
    expect(screen.queryByRole('heading', { name: 'Import' })).not.toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText('Your Data')).toBeInTheDocument();
    expect(screen.getByText('Manage app access')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-logout-button'));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
