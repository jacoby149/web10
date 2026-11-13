import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ConsentView from '../components/Consent/ConsentView';
import ContractPage from '../components/Contracts/ContractPage';
import PermissionSummary from '../components/Consent/PermissionSummary';
import { dataTypeLabel, permissionDescription, permissionGroups, groupActionDescription } from '../lib/consentLanguage';

const request = { kind: 'app', app_origin: 'https://notes.example:8443', permissions: { posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'], contacts: ['readAll'] } };
const harness = (overrides: Record<string, any> = {}) => ({
  isAuthenticated: () => true, v3: { readToken: () => ({ username: 'alice' }) },
  v3Contracts: [], pendingContracts: [request], _expectedUser: 'alice',
  approveContract: vi.fn(), denyContract: vi.fn(), approveAll: vi.fn(), skipConsent: vi.fn(),
  goToApp: vi.fn(), logout: vi.fn(), setMode: vi.fn(), hasRecoveryContact: () => true,
  ...overrides,
});
const action = (text: string) => screen.getAllByTestId('permission-action').find(element => element.textContent === text);

describe('permission language is a faithful display, never a new grant', () => {
  it('keeps own versus all, wildcard scope and unknown names explicit', () => {
    expect(permissionDescription('readAll', 'posts')).toBe('Read posts you can access');
    expect(permissionDescription('updateOwn', 'posts')).toBe('Edit posts you created');
    expect(permissionDescription('deleteOwn', 'posts')).toBe('Delete posts you created');
    expect(permissionDescription('updateAll', 'posts')).toBe('Edit any posts you can access');
    expect(permissionDescription('deleteAll', 'posts')).toBe('Delete any posts you can access');
    expect(dataTypeLabel('*')).toBe('all data types');
    expect(dataTypeLabel('custom-vault')).toBe('custom-vault');
    expect(permissionDescription('exportEverything')).toContain('exportEverything');
    expect(permissionDescription('toString')).toContain('toString');
    expect(dataTypeLabel('constructor')).toBe('constructor');
  });

  it('groups only identical operation sets without mutating the request', () => {
    const permissions = { posts: ['readAll', 'create'], comments: ['create', 'readAll'], contacts: ['readAll'] };
    const original = JSON.stringify(permissions);
    expect(permissionGroups(permissions)).toEqual([
      { services: ['posts', 'comments'], operations: ['readAll', 'create'] },
      { services: ['contacts'], operations: ['readAll'] },
    ]);
    expect(JSON.stringify(permissions)).toBe(original);
  });

  it('describes typed and legacy group actions without raw action codes', () => {
    expect(groupActionDescription({ action: 'create_group', name: 'Friends' })).toBe('Create the group “Friends”');
    expect(groupActionDescription({ action: 'delete_group', params: { group_id: 'example/groups/friends' } })).toContain('Delete the group');
    expect(groupActionDescription({ action: 'future_action' })).toContain('future_action');
  });

  it('shows readable complete scopes before approval and exact details on demand', () => {
    const I = harness();
    render(<ConsentView I={I} />);
    expect(screen.getByRole('heading', { name: 'Allow this app access?' })).toBeTruthy();
    expect(screen.getByText('App permissions')).toBeTruthy();
    expect(action('Read posts you can access')).toBeTruthy();
    expect(action('Create posts')).toBeTruthy();
    expect(action('Edit posts you created')).toBeTruthy();
    expect(action('Read contacts you can access')).toBeTruthy();
    expect(action('Create contacts')).toBeUndefined();
    expect(screen.queryByText('readAll')).toBeNull();
    expect(I.approveContract).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('consent-details-0'));
    expect(screen.getByText(request.app_origin)).toBeTruthy();
    expect(screen.getAllByText('readAll')).toHaveLength(2);
    fireEvent.click(screen.getByTestId('consent-approve-0'));
    expect(I.approveContract).toHaveBeenCalledWith(request);
    fireEvent.click(screen.getByTestId('consent-deny-0'));
    expect(I.denyContract).toHaveBeenCalledWith(request);
    fireEvent.click(screen.getByTestId('consent-approve-all'));
    expect(I.approveAll).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('consent-skip'));
    expect(I.skipConsent).toHaveBeenCalledOnce();
    expect(I.goToApp).not.toHaveBeenCalled();
  });

  it('retains existing-grant differences, status and group request identity', () => {
    const group = { kind: 'group', app_origin: request.app_origin, action: 'create_group', name: 'Friends', roles: [{ name: 'reader', permissions: { posts: ['readAll'] } }] };
    render(<ConsentView I={harness({ pendingContracts: [request, group], v3Contracts: [{ allowed_origin: request.app_origin, permissions: { posts: ['readAll'] } }], status: 'Waiting for approval' })} />);
    expect(screen.getByRole('status').textContent).toBe('Waiting for approval');
    expect(screen.getByText('Group permissions')).toBeTruthy();
    expect(screen.getByText('Create the group “Friends”')).toBeTruthy();
    fireEvent.click(screen.getByTestId('consent-details-0'));
    expect(screen.getByText('create')).toHaveClass('bg-success/15');
    fireEvent.click(screen.getByTestId('consent-details-1'));
    expect(screen.getByText(/"reader"/)).toBeTruthy();
  });

  it('uses App permissions and readable scopes on the management page', () => {
    render(<ContractPage I={harness({ v3Contracts: [{ allowed_origin: request.app_origin, permissions: request.permissions }] })} />);
    expect(screen.getByRole('heading', { name: 'App permissions' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('app-contract-toggle'));
    expect(action('Read posts you can access')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove app permissions' })).toBeTruthy();
    expect(within(screen.getByTestId('contract-page')).queryByText(/App Contracts/)).toBeNull();
  });

  it('finds permissions by their readable data-type names as well as exact keys', () => {
    render(<ContractPage I={harness({ search: 'playlist bookmarks', v3Contracts: [{ allowed_origin: request.app_origin, permissions: { 'web10-social-playlist-bookmarks': ['readAll'] } }] })} />);
    expect(screen.getByTestId('app-contract-toggle')).toBeTruthy();
    fireEvent.click(screen.getByTestId('app-contract-toggle'));
    expect(action('Read playlist bookmarks you can access')).toBeTruthy();
  });

  it('keeps the primary review plain English without code badges while preserving unknown scope', () => {
    const { container } = render(<PermissionSummary permissions={{
      posts: ['readAll'], post: ['create'], 'web10-social-playlist-bookmarks': ['readAll'], Custom_Service: ['deleteOwn'], '*': ['deleteAll'],
    }} />);
    expect(container.querySelector('code')).toBeNull();
    expect(screen.getByText('For these data types')).toBeTruthy();
    expect(screen.getByText('playlist bookmarks')).toBeTruthy();
    expect(action('Create post')).toBeTruthy();
    expect(action('Delete Custom_Service you created')).toBeTruthy();
    expect(screen.getByText('all data types')).toBeTruthy();
  });
});
