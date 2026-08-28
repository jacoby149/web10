import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import GroupRolesDialog from '../components/Groups/GroupRolesDialog'
import GroupCard from '../components/Groups/GroupCard'

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

  it('does not show the toggle for a non-managed group', () => {
    render(<GroupCard I={cardI} group={managedGroup} isManaged={false} />)
    expandCard()
    expect(screen.queryByTestId('discoverable-toggle')).toBeNull()
  })
})