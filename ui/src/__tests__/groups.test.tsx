import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import GroupRolesDialog from '../components/Groups/GroupRolesDialog'
import GroupCard from '../components/Groups/GroupCard'
import GroupSettingsDialog from '../components/Groups/GroupSettingsDialog'
import { groupDisplayName, roleOps, hasRoleOp, isRoleMap } from '../lib/group-utils'

const mockI = {
  v3UpdateGroup: vi.fn(),
  v3GroupsManagesLoad: vi.fn(),
  setStatus: vi.fn(),
}

const mockGroup = {
  group_id: 'g1',
  group_name: 'Test Group',
  roles: [
    { name: 'admin', permissions: ['assignRoles'], services: ['posts'] },
    { name: 'member', permissions: ['readAll'], services: ['posts', 'comments'] },
  ],
}

describe('GroupRolesDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockI.v3UpdateGroup.mockResolvedValue({})
  })

  it('renders roles from group data', () => {
    render(
      <GroupRolesDialog
        open={true}
        onOpenChange={vi.fn()}
        group={mockGroup}
        I={mockI}
      />
    )
    const roleInputs = screen.getAllByRole('textbox', { name: 'Role name' })
    expect(roleInputs).toHaveLength(2)
    expect(roleInputs[0]).toHaveValue('admin')
    expect(roleInputs[1]).toHaveValue('member')
  })

  it('prevents saving roles with empty name', async () => {
    render(
      <GroupRolesDialog
        open={true}
        onOpenChange={vi.fn()}
        group={{ ...mockGroup, roles: [{ name: '', permissions: [], services: [] }] }}
        I={mockI}
      />
    )
    fireEvent.click(screen.getByText('Save roles'))
    await waitFor(() => {
      expect(mockI.setStatus).toHaveBeenCalledWith('Role names cannot be empty')
      expect(mockI.v3UpdateGroup).not.toHaveBeenCalled()
    })
  })

  it('uses stable keys for role editors', () => {
    render(
      <GroupRolesDialog
        open={true}
        onOpenChange={vi.fn()}
        group={mockGroup}
        I={mockI}
      />
    )
    const roleInputs = screen.getAllByRole('textbox', { name: 'Role name' })
    expect(roleInputs).toHaveLength(2)
    fireEvent.change(roleInputs[0], { target: { value: 'admin_edited' } })
    expect(roleInputs[0]).toHaveValue('admin_edited')
  })
})

// ---------------------------------------------------------------------------
// GroupCard — "List in directory" toggle (the discoverable flag, D53)
// ---------------------------------------------------------------------------

const cardI = {
  v3UpdateGroup: vi.fn(),
  v3GroupsManagesLoad: vi.fn(),
  v3GetGroupMembers: vi.fn(),
  setStatus: vi.fn(),
}

const managedGroup = {
  group_id: 'web10.app/groups/users/alice/jazz',
  join_policy: 'open',
  my_role: 'owner',
  member_count: 3,
  discoverable: true,
  roles: [{ name: 'owner', permissions: ['manageRoles'], services: ['*'] }],
}

function expandCard() {
  fireEvent.click(screen.getByTestId('group-card-header'))
}

describe('GroupCard — List in directory toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cardI.v3UpdateGroup.mockResolvedValue({})
  })

  it('shows the toggle (expanded, managed) reflecting the discoverable state', () => {
    render(<GroupCard I={cardI} group={managedGroup} isManaged={true} />)
    expandCard()
    expect(screen.getByTestId('discoverable-toggle')).toHaveAttribute('aria-checked', 'true')
  })

  it('toggling off calls v3UpdateGroup with discoverable: false', async () => {
    render(<GroupCard I={cardI} group={managedGroup} isManaged={true} />)
    expandCard()
    fireEvent.click(screen.getByTestId('discoverable-toggle'))
    await waitFor(() => {
      expect(cardI.v3UpdateGroup).toHaveBeenCalledWith('web10.app/groups/users/alice/jazz', { discoverable: false })
    })
  })

  it('toggling on (from false) calls v3UpdateGroup with discoverable: true', async () => {
    render(<GroupCard I={cardI} group={{ ...managedGroup, discoverable: false }} isManaged={true} />)
    expandCard()
    expect(screen.getByTestId('discoverable-toggle')).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByTestId('discoverable-toggle'))
    await waitFor(() => {
      expect(cardI.v3UpdateGroup).toHaveBeenCalledWith('web10.app/groups/users/alice/jazz', { discoverable: true })
    })
  })

  it('treats a group with no discoverable field as not listed (the new default)', () => {
    const { group_id, join_policy, my_role, member_count, roles } = managedGroup
    render(<GroupCard I={cardI} group={{ group_id, join_policy, my_role, member_count, roles }} isManaged={true} />)
    expandCard()
    expect(screen.getByTestId('discoverable-toggle')).toHaveAttribute('aria-checked', 'false')
  })

  it('does not show the toggle for a non-managed group', () => {
    render(<GroupCard I={cardI} group={managedGroup} isManaged={false} />)
    expandCard()
    expect(screen.queryByTestId('discoverable-toggle')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// GroupSettingsDialog — join policy editor (the contract policy editor, D53)
// ---------------------------------------------------------------------------

const settingsI = {
  v3UpdateGroup: vi.fn(),
  v3GroupsManagesLoad: vi.fn(),
  setStatus: vi.fn(),
}

const settingsGroup = {
  group_id: 'web10.app/groups/users/alice/jazz',
  join_policy: 'open',
  roles: [{ name: 'owner', permissions: ['manageRoles'], services: ['*'] }],
}

describe('GroupSettingsDialog — join policy editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settingsI.v3UpdateGroup.mockResolvedValue({})
  })

  it('renders the group current policy as selected', () => {
    render(<GroupSettingsDialog open={true} onOpenChange={vi.fn()} group={settingsGroup} I={settingsI} />)
    expect(screen.getByTestId('join-policy-open')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('join-policy-request')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('join-policy-invite_only')).toHaveAttribute('aria-pressed', 'false')
  })

  it('picking a policy + save calls v3UpdateGroup with the new join_policy', async () => {
    render(<GroupSettingsDialog open={true} onOpenChange={vi.fn()} group={settingsGroup} I={settingsI} />)
    fireEvent.click(screen.getByTestId('join-policy-invite_only'))
    expect(screen.getByTestId('join-policy-invite_only')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => {
      expect(settingsI.v3UpdateGroup).toHaveBeenCalledWith('web10.app/groups/users/alice/jazz', { join_policy: 'invite_only' })
    })
  })

  it('save failure → error status with the reason, no successful update', async () => {
    settingsI.v3UpdateGroup.mockRejectedValueOnce(new Error('boom'))
    render(<GroupSettingsDialog open={true} onOpenChange={vi.fn()} group={settingsGroup} I={settingsI} />)
    fireEvent.click(screen.getByTestId('join-policy-request'))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => {
      expect(settingsI.setStatus).toHaveBeenCalledWith('Failed to update join policy: boom')
    })
  })

  it('cancel closes without saving', () => {
    const onOpenChange = vi.fn()
    render(<GroupSettingsDialog open={true} onOpenChange={onOpenChange} group={settingsGroup} I={settingsI} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(settingsI.v3UpdateGroup).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// group-utils — role permission shape helpers (D58 map vs legacy flat)
// ---------------------------------------------------------------------------

describe('group-utils — role shape helpers', () => {
  it('isRoleMap: true for the D58 map, false for the legacy flat list', () => {
    expect(isRoleMap({ posts: ['readAll'], group: ['manageRoles'] })).toBe(true)
    expect(isRoleMap({})).toBe(true)
    expect(isRoleMap(['readAll'])).toBe(false)
    expect(isRoleMap(undefined)).toBe(false)
    expect(isRoleMap(null)).toBe(false)
  })

  it('roleOps: flattens the D58 map across service keys (deduped)', () => {
    expect(roleOps({ name: 'owner', permissions: { '*': ['readAll', 'create'], group: ['manageRoles', 'readAll'] } }))
      .toEqual(['readAll', 'create', 'manageRoles'])
  })

  it('roleOps: passes the legacy flat list through', () => {
    expect(roleOps({ name: 'admin', services: ['posts'], permissions: ['readAll', 'create'] }))
      .toEqual(['readAll', 'create'])
  })

  it('roleOps: missing/unknown permissions → []', () => {
    expect(roleOps({ name: 'x' })).toEqual([])
    expect(roleOps(undefined)).toEqual([])
    expect(roleOps(null)).toEqual([])
  })

  it('hasRoleOp: finds the op under any service key, including the reserved group key', () => {
    expect(hasRoleOp({ permissions: { group: ['deleteGroup'] } }, 'deleteGroup')).toBe(true)
    expect(hasRoleOp({ permissions: { posts: ['readAll'] } }, 'deleteGroup')).toBe(false)
    expect(hasRoleOp({ permissions: ['deleteGroup'] }, 'deleteGroup')).toBe(true)
    expect(hasRoleOp(undefined, 'deleteGroup')).toBe(false)
  })

  it('groupDisplayName: falls back to the full id (or empty) without throwing on a missing id', () => {
    expect(groupDisplayName('web10.app/groups/users/alice/jazz')).toBe('jazz')
    expect(groupDisplayName('')).toBe('')
    expect(groupDisplayName(undefined as any)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// GroupCard — D58 per-service role shape (the "Something went wrong" crash)
// ---------------------------------------------------------------------------

// The shape the UI's own CreateGroupDialog (and the social app) writes —
// permissions is a per-service MAP, not the legacy flat array.
const d58Group = {
  group_id: 'web10.app/groups/users/alice/jazz',
  join_policy: 'invite_only',
  my_role: 'owner',
  member_count: 2,
  discoverable: false,
  roles: [
    { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'], group: ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] } },
    { name: 'member', permissions: { posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'], comments: ['readAll', 'create', 'updateOwn', 'deleteOwn'] } },
  ],
}

describe('GroupCard — D58 per-service role shape', () => {
  it('renders a D58-shape group without throwing (the crash regression)', () => {
    render(<GroupCard I={cardI} group={d58Group} isManaged={true} />)
    expect(screen.getByTestId('group-card-header')).toBeInTheDocument()
  })

  it('expanded: renders the per-service permission map, not a crash', () => {
    render(<GroupCard I={cardI} group={d58Group} isManaged={true} />)
    expandCard()
    expect(screen.getByText('group: manageRoles, assignRoles, revokeRoles, deleteGroup')).toBeInTheDocument()
    expect(screen.getByText('posts: readAll, create, updateOwn, deleteOwn')).toBeInTheDocument()
  })

  it('shows the Delete group button when the role grants deleteGroup under the group key', () => {
    render(<GroupCard I={cardI} group={d58Group} isManaged={true} />)
    expandCard()
    expect(screen.getByRole('button', { name: /Delete group/ })).toBeInTheDocument()
  })

  it('hides the Delete group button when the role has no deleteGroup grant', () => {
    render(<GroupCard I={cardI} group={{ ...d58Group, my_role: 'member' }} isManaged={true} />)
    expandCard()
    expect(screen.queryByRole('button', { name: /Delete group/ })).toBeNull()
  })

  it('still renders a legacy flat-shape group (both shapes coexist)', () => {
    render(<GroupCard I={cardI} group={managedGroup} isManaged={true} />)
    expandCard()
    expect(screen.getByText('manageRoles')).toBeInTheDocument()
  })

  it('does not crash when a group row has no group_id', () => {
    const { group_id: _omit, ...noId } = d58Group
    render(<GroupCard I={cardI} group={noId} isManaged={true} />)
    expect(screen.getByTestId('group-card-header')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// GroupRolesDialog — D58 per-service role shape
// ---------------------------------------------------------------------------

const rolesDialogI = {
  v3UpdateGroup: vi.fn(),
  v3GroupsManagesLoad: vi.fn(),
  setStatus: vi.fn(),
}

describe('GroupRolesDialog — D58 per-service role shape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rolesDialogI.v3UpdateGroup.mockResolvedValue({})
  })

  it('renders a D58-shape role without throwing, showing each service row', () => {
    render(
      <GroupRolesDialog
        open={true}
        onOpenChange={vi.fn()}
        group={{ group_id: 'g1', roles: d58Group.roles }}
        I={rolesDialogI}
      />
    )
    const roleInputs = screen.getAllByRole('textbox', { name: 'Role name' })
    expect(roleInputs).toHaveLength(2)
    // The owner role's two service keys are editable rows.
    expect(screen.getByRole('textbox', { name: 'Service *' })).toHaveValue('*')
    expect(screen.getByRole('textbox', { name: 'Service group' })).toHaveValue('group')
  })

  it('toggling a permission edits that service\'s op list', () => {
    render(
      <GroupRolesDialog
        open={true}
        onOpenChange={vi.fn()}
        group={{ group_id: 'g1', roles: [{ name: 'owner', permissions: { group: ['manageRoles'] } }] }}
        I={rolesDialogI}
      />
    )
    // "Delete group" is inactive under the group service…
    const deleteGroupBtn = screen.getByRole('button', { name: 'Delete group' })
    fireEvent.click(deleteGroupBtn)
    // …and saving persists the D58 map with the new op.
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    waitFor(() => {
      expect(rolesDialogI.v3UpdateGroup).toHaveBeenCalledWith('g1', {
        roles: [{ name: 'owner', permissions: { group: ['manageRoles', 'deleteGroup'] } }],
      })
    })
  })

  it('normalizes a legacy flat-shape role and saves the D58 map', async () => {
    render(
      <GroupRolesDialog
        open={true}
        onOpenChange={vi.fn()}
        group={{ group_id: 'g1', roles: [{ name: 'admin', services: ['posts'], permissions: ['readAll', 'create'] }] }}
        I={rolesDialogI}
      />
    )
    // The legacy services array became service rows.
    expect(screen.getByRole('textbox', { name: 'Service posts' })).toHaveValue('posts')
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await waitFor(() => {
      expect(rolesDialogI.v3UpdateGroup).toHaveBeenCalledWith('g1', {
        roles: [{ name: 'admin', permissions: { posts: ['readAll', 'create'] } }],
      })
    })
  })

  it('a legacy role with no services fans out to the * wildcard', async () => {
    render(
      <GroupRolesDialog
        open={true}
        onOpenChange={vi.fn()}
        group={{ group_id: 'g1', roles: [{ name: 'admin', permissions: ['readAll'] }] }}
        I={rolesDialogI}
      />
    )
    expect(screen.getByRole('textbox', { name: 'Service *' })).toHaveValue('*')
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await waitFor(() => {
      expect(rolesDialogI.v3UpdateGroup).toHaveBeenCalledWith('g1', {
        roles: [{ name: 'admin', permissions: { '*': ['readAll'] } }],
      })
    })
  })

  it('drops an unnamed (half-typed) service row on save', async () => {
    render(
      <GroupRolesDialog
        open={true}
        onOpenChange={vi.fn()}
        group={{ group_id: 'g1', roles: [{ name: 'owner', permissions: { posts: ['readAll'], '': ['create'] } }] }}
        I={rolesDialogI}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }))
    await waitFor(() => {
      expect(rolesDialogI.v3UpdateGroup).toHaveBeenCalledWith('g1', {
        roles: [{ name: 'owner', permissions: { posts: ['readAll'] } }],
      })
    })
  })
})