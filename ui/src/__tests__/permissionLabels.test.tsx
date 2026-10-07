import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { permissionLabel, hasManagementPermissions, managementWarning } from '../lib/permissionLabels';
import ConsentView from '../components/Consent/ConsentView';
import ContractPage from '../components/Contracts/ContractPage';
import RequestPage from '../components/Contracts/RequestPage';

vi.mock('../components/shared/AppShell', () => ({ default: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const origin = 'https://studio.example';
const permissions = { imports: ['create', 'read'], user: ['blockUsers'], profile: ['create'] };
function harness(requested: Record<string, string[]> = permissions) {
  return {
    isAuthenticated: () => true, hasRecoveryContact: () => true,
    _expectedUser: 'alice', _contractReceived: true,
    v3: { readToken: () => ({ username: 'alice' }) },
    v3Contracts: [{ allowed_origin: origin, permissions: { '*': ['create', 'read', 'blockUsers'] } }],
    pendingContracts: [{ kind: 'app', app_origin: origin, permissions: requested }],
    approveContract: vi.fn(), approveAll: vi.fn(), goToApp: vi.fn(),
  };
}

describe('reserved permission labels and warnings', () => {
  it('labels operations by service, never conflating import execution with document creation', () => {
    expect(permissionLabel('imports', 'create')).toBe('Import your export data');
    expect(permissionLabel('imports', 'read')).toBe('Read import progress');
    expect(permissionLabel('user', 'blockUsers')).toBe('Manage your blocked users');
    expect(permissionLabel('profile', 'create')).toBe('Create data');
    expect(permissionLabel('group', 'blockMembers')).toBe('Block group members');
    expect(permissionLabel('posts', 'blockUsers')).toBe('blockUsers');
  });
  it('detects sensitive namespaces explicitly rather than through a wildcard', () => {
    for (const service of ['group', 'node', 'user', 'imports']) {
      expect(hasManagementPermissions({ [service]: ['create'] })).toBe(true);
      expect(hasManagementPermissions({ [service]: [] })).toBe(false);
    }
    expect(hasManagementPermissions({ '*': ['create', 'read', 'blockUsers'] })).toBe(false);
    expect(hasManagementPermissions({ imports_archive: ['create'] })).toBe(false);
    expect(hasManagementPermissions({ '*': ['hideAll'] })).toBe(true);
  });
  it('distinguishes user-wide blocking, import execution, private progress, write scope and self-only exceptions', () => {
    const warning = managementWarning(permissions);
    expect(warning).toContain('User blocking is account-wide');
    expect(warning).toContain('read private exports');
    expect(warning).toContain('write posts, comments, media, profiles and group data');
    expect(warning).toContain('Matching service/group grants and target-group ownership are required');
    expect(warning).toContain('progress-only access cannot run imports');
    expect(warning).toContain('Account credentials and authority changes stay in the authenticator');
    expect(warning).not.toContain('Node actions require');
    expect(managementWarning({ imports: ['read'] })).not.toContain('can write');
  });
  it('keeps even the combined warning concise without losing authority limits', () => {
    const warning = managementWarning({ ...permissions, group: ['manageRoles'], node: ['moderate'], posts: ['hideAll'] });
    expect(warning.split(/\s+/).length).toBeLessThanOrEqual(105);
    expect(warning).toContain('all groups within your authority');
    expect(warning).toContain('membership grants no management power');
    expect(warning).toContain('current node-admin authority');
    expect(warning).toContain('Moderation requires granted services and your authority');
  });
  it.each([
    { imports: ['create'] }, { imports: ['read'] }, { user: ['blockUsers'] },
  ])('requires explicit consent for a reserved upgrade despite existing wildcard grants: %j', (requested) => {
    const I = harness(requested);
    render(<ConsentView I={I} />);
    expect(screen.getByTestId('consent-req-0')).toBeTruthy();
    expect(screen.getByTestId('consent-management-warning')).toBeTruthy();
    expect(I.goToApp).not.toHaveBeenCalled();
    expect(I.approveContract).not.toHaveBeenCalled();
    expect(I.approveAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('consent-approve-0'));
    expect(I.approveContract).toHaveBeenCalledWith(I.pendingContracts[0]);
  });
  it('uses the same service-specific labels and warnings on consent, contracts, and pending requests', () => {
    const I = harness();
    const { unmount } = render(<ConsentView I={I} />);
    expect(screen.getAllByText('Import your export data').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Read import progress').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Manage your blocked users').length).toBeGreaterThan(0);
    unmount();

    const contracts = render(<ContractPage I={{ ...I, v3Contracts: [{ allowed_origin: origin, permissions }] }} />);
    fireEvent.click(screen.getByTestId('app-contract-toggle'));
    expect(screen.getByText('Import your export data')).toBeTruthy();
    expect(screen.getByText('Read import progress')).toBeTruthy();
    expect(screen.getByText('Manage your blocked users')).toBeTruthy();
    expect(screen.getByText(managementWarning(permissions))).toBeTruthy();
    fireEvent.click(screen.getByTestId('contract-revoke-toggle'));
    expect(screen.getByText(/lose all data and management access/)).toBeTruthy();
    contracts.unmount();

    render(<RequestPage I={{ ...I, pendingACRs: I.pendingContracts, approveACR: vi.fn(), denyACR: vi.fn() }} />);
    expect(screen.getByText('Import your export data')).toBeTruthy();
    expect(screen.getByText('Read import progress')).toBeTruthy();
    expect(screen.getByText('Manage your blocked users')).toBeTruthy();
    expect(screen.getByText(managementWarning(permissions))).toBeTruthy();
  });
});
