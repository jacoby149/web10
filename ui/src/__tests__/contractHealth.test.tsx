import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ContractHealth from '../components/Groups/ContractHealth'

// The contract-health surface (KB: groups/contract-healing.md) — the
// authenticator's generic referential-integrity check. It detects member rows
// that name a role the group's contract doesn't define (dangling grants — the
// "owner absent from the people directory" failure class) with no app-specific
// spec. The repair is the owning app's self-heal, not the authenticator's.

function makeI(groups: any[], groupShapes: Record<string, { roles: any[]; members: any[] }>) {
  return {
    v3: {
      getGroup: vi.fn(async (groupId: string) => groupShapes[groupId] ?? { roles: [] }),
      getGroupMembers: vi.fn(async (groupId: string) => groupShapes[groupId]?.members ?? []),
    },
  } as any
}

const GROUPS = [
  { group_id: 'web10.app/groups/users/alice/followers' },
  { group_id: 'web10.app/groups/users/bob/followers' },
]

describe('ContractHealth', () => {
  it('renders the check affordance when idle', () => {
    render(<ContractHealth I={makeI(GROUPS, {})} groups={GROUPS} />)
    expect(screen.getByTestId('contract-health-check')).toBeInTheDocument()
  })

  it('reports all healthy when every grant references a defined role', async () => {
    const I = makeI(GROUPS, {
      'web10.app/groups/users/alice/followers': {
        roles: [{ name: 'owner', permissions: { '*': ['readAll'] } }, { name: 'reader', permissions: { profile: ['readAll'] } }],
        members: [{ member_key: 'alice', role: 'owner' }, { member_key: 'anyone', role: 'reader' }],
      },
      'web10.app/groups/users/bob/followers': {
        roles: [{ name: 'owner', permissions: { '*': ['readAll'] } }],
        members: [{ member_key: 'bob', role: 'owner' }],
      },
    })
    render(<ContractHealth I={I} groups={GROUPS} />)
    fireEvent.click(screen.getByTestId('contract-health-check'))
    await waitFor(() =>
      expect(screen.getByText(/All 2 group contracts are healthy/)).toBeInTheDocument(),
    )
  })

  it('surfaces a dangling grant (a member row naming an undefined role)', async () => {
    // alice's followers group has the `anyone → reader` row but the contract
    // defines no `reader` role — the grant is inert. The check names it.
    const I = makeI(GROUPS, {
      'web10.app/groups/users/alice/followers': {
        roles: [{ name: 'owner', permissions: { '*': ['readAll'] } }, { name: 'member', permissions: { posts: ['readAll'] } }],
        members: [{ member_key: 'alice', role: 'owner' }, { member_key: 'anyone', role: 'reader' }],
      },
      'web10.app/groups/users/bob/followers': {
        roles: [{ name: 'owner', permissions: { '*': ['readAll'] } }],
        members: [{ member_key: 'bob', role: 'owner' }],
      },
    })
    render(<ContractHealth I={I} groups={GROUPS} />)
    fireEvent.click(screen.getByTestId('contract-health-check'))
    await waitFor(() => expect(screen.getByTestId('contract-health-drift')).toBeInTheDocument())
    // The affected group + the specific dangling grant are named.
    expect(screen.getByText(/web10.app\/groups\/users\/alice\/followers/)).toBeInTheDocument()
    expect(screen.getByText(/anyone → reader/)).toBeInTheDocument()
    // The repair pointer: the owning app fixes it on next sign-in.
    expect(screen.getByText(/repairs it on your next sign-in/)).toBeInTheDocument()
  })

  it('a group that fails to read is skipped (degrades, never blanks the check)', async () => {
    const I = makeI(GROUPS, {
      'web10.app/groups/users/bob/followers': {
        roles: [{ name: 'owner', permissions: { '*': ['readAll'] } }],
        members: [{ member_key: 'bob', role: 'owner' }],
      },
    })
    // alice's group throws on read — the check skips it, still reports bob clean.
    I.v3.getGroup.mockImplementation(async (id: string) => {
      if (id.includes('alice')) throw new Error('not found')
      return { roles: [{ name: 'owner', permissions: { '*': ['readAll'] } }] }
    })
    render(<ContractHealth I={I} groups={GROUPS} />)
    fireEvent.click(screen.getByTestId('contract-health-check'))
    await waitFor(() =>
      expect(screen.getByText(/group contracts? (is|are) healthy/)).toBeInTheDocument(),
    )
  })
})
