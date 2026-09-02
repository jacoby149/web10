import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import GroupRolesDialog from '../components/Groups/GroupRolesDialog'
import GroupCard from '../components/Groups/GroupCard'
import GroupSettingsDialog from '../components/Groups/GroupSettingsDialog'

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

  it('save failure → error status, no successful update', async () => {
    settingsI.v3UpdateGroup.mockRejectedValueOnce(new Error('boom'))
    render(<GroupSettingsDialog open={true} onOpenChange={vi.fn()} group={settingsGroup} I={settingsI} />)
    fireEvent.click(screen.getByTestId('join-policy-request'))
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => {
      expect(settingsI.setStatus).toHaveBeenCalledWith('Failed to update join policy')
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