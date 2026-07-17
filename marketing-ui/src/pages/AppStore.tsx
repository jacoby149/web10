import { useEffect, useState } from 'react'
import { Apps } from '../components/Apps'

const API_URL = window.location.protocol === 'https:'
  ? 'https://api.web10.app'
  : 'http://api.localhost'

const DEFAULT_APPS = [
  { href: 'https://web10-social.web10.app', hits: 0 },
  { href: 'https://web10-mail.web10.app', hits: 0 },
]

function AppStore() {
  const [stats, setStats] = useState({ users: 0, apps: 0, hits: 0, data: 0 })
  const [apps, setApps] = useState(DEFAULT_APPS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get(`${API_URL}/stats`).then(r => {
      setStats({
        users: r.data.registered_users || 0,
        apps: r.data.app_count || 0,
        hits: r.data.total_visits || 0,
        data: r.data.liberated_data || 0,
      })
    }).catch(() => {})

    axios.get(`${API_URL}/registered_apps`).then(r => {
      setApps(r.data || DEFAULT_APPS)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  return (
    <section className="section" style={{ minHeight: '100vh', backgroundColor: '#fafafa' }}>
      <div className="container">
        <h1 className="title has-text-centered">web10 App Store</h1>
        <p className="subtitle has-text-centered">Discover apps built on the web10 protocol</p>

        <div className="columns is-centered has-text-centered" style={{ marginTop: '2rem' }}>
          <div className="column">
            <p className="heading">Users</p>
            <p className="title is-3">{stats.users?.toLocaleString()}</p>
          </div>
          <div className="column">
            <p className="heading">Apps</p>
            <p className="title is-3">{stats.apps?.toLocaleString()}</p>
          </div>
          <div className="column">
            <p className="heading">Hits</p>
            <p className="title is-3">{stats.hits?.toLocaleString()}</p>
          </div>
          <div className="column">
            <p className="heading">Data (MB)</p>
            <p className="title is-3">{stats.data?.toLocaleString()}</p>
          </div>
        </div>

        <h2 className="title is-4 has-text-centered mt-5">Top web10 Apps</h2>
        {loading ? (
          <div className="has-text-centered mt-5">
            <div className="loading-is-on">Loading apps...</div>
          </div>
        ) : (
          <Apps apps={apps} />
        )}

        <div className="has-text-centered mt-5">
          <a className="button is-primary is-large" href="https://auth.web10.app">
            Explore Apps
          </a>
        </div>
      </div>
    </section>
  )
}

import axios from 'axios'

export default AppStore
