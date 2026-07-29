import { API_ORIGIN } from './origins'

export interface GraphNode {
  username: string
  followersCount: number
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface FollowEntry {
  author: string
  target: string
  payload: { action: string }
}

interface DiscoverUser {
  username: string
  followers_count?: number
}

const provider = (() => {
  const url = new URL(API_ORIGIN)
  return url.hostname
})()

function extractUsernameFromTarget(target: string): string | null {
  // target format: follow:{username}@{provider}
  const match = target.match(/^follow:([^@]+)@/)
  return match ? match[1] : null
}

export async function fetchGraphData(limit = 200): Promise<GraphData> {
  const [followEntries, discoverUsers] = await Promise.all([
    fetch(`${API_ORIGIN}/public/entries?limit=${limit}`).then(r => r.json() as Promise<FollowEntry[]>),
    fetch(`${API_ORIGIN}/discover/users?limit=100`).then(r => r.json() as Promise<DiscoverUser[]>),
  ])

  const followEntriesFiltered = (followEntries || []).filter(
    (e: FollowEntry) => e.payload?.action === 'follow'
  )

  // Build adjacency: follower -> followed
  const followedSet = new Set<string>()
  const edges: Map<string, GraphEdge> = new Map()

  for (const entry of followEntriesFiltered) {
    const followed = extractUsernameFromTarget(entry.target)
    if (followed) {
      followedSet.add(followed)
      const key = `${entry.author}->${followed}`
      if (!edges.has(key)) {
        edges.set(key, { source: entry.author, target: followed })
      }
    }
  }

  // Merge with discover users for names/avatars
  const userMap = new Map<string, GraphNode>()

  // Add all users from discover
  for (const u of (discoverUsers || [])) {
    userMap.set(u.username, {
      username: u.username,
      followersCount: u.followers_count ?? 0,
    })
  }

  // Add all users from follow edges
  for (const edge of edges.values()) {
    if (!userMap.has(edge.source)) {
      userMap.set(edge.source, { username: edge.source, followersCount: 0 })
    }
    if (!userMap.has(edge.target)) {
      userMap.set(edge.target, { username: edge.target, followersCount: 0 })
    }
  }

  return {
    nodes: Array.from(userMap.values()),
    edges: Array.from(edges.values()),
  }
}