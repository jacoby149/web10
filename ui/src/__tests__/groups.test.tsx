import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import GroupRolesDialog from '../components/Groups/GroupRolesDialog'

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