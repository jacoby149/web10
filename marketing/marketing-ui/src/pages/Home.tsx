import { useEffect, useState } from 'react'
import axios from 'axios'

const API_URL = window.location.protocol === 'https:'
  ? 'https://api.web10.app'
  : 'http://api.localhost'

function Stats() {
  const [stats, setStats] = useState({ users: '..', apps: '..', visits: '..', data: '..' })

  useEffect(() => {
    axios.get(`${API_URL}/stats`).then(r => {
      const d = r.data
      setStats({
        users: d.registered_users?.toLocaleString() || '..',
        apps: d.app_count?.toLocaleString() || '..',
        visits: d.total_visits?.toLocaleString() || '..',
        data: d.liberated_data || '..',
      })
    }).catch(() => {})
  }, [])

  return (
    <section className="section" style={{ backgroundColor: '#1a1a2e', color: 'white' }}>
      <div className="container">
        <div className="columns is-centered">
          <div className="column is-one-quarter has-text-centered">
            <span className="icon is-large">
              <i className="fa fa-child" style={{ fontSize: '48px' }}></i>
            </span>
            <p className="heading">Registered Users</p>
            <p className="title">{stats.users}</p>
          </div>
          <div className="column is-one-quarter has-text-centered">
            <span className="icon is-large">
              <i className="fa fa-slideshare" style={{ fontSize: '48px' }}></i>
            </span>
            <p className="heading">Registered Apps</p>
            <p className="title">{stats.apps}</p>
          </div>
          <div className="column is-one-quarter has-text-centered">
            <span className="icon is-large">
              <i className="fa fa-edit" style={{ fontSize: '48px' }}></i>
            </span>
            <p className="heading">Total App Visits</p>
            <p className="title">{stats.visits}</p>
          </div>
          <div className="column is-one-quarter has-text-centered">
            <span className="icon is-large">
              <i className="fa fa-slack" style={{ fontSize: '48px' }}></i>
            </span>
            <p className="heading">Data Liberated</p>
            <p className="title">{stats.data} MB</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section className="section">
      <div className="container">
        <div className="columns">
          <div className="column is-one-third has-text-centered">
            <span className="icon is-large">
              <i className="fa fa-sitemap" style={{ fontSize: '48px', color: '#3273dc' }}></i>
            </span>
            <h3 className="title is-4">Peer to Peer</h3>
            <p>High speed experiences, connecting device to device via WebRTC datachannel technology.</p>
          </div>
          <div className="column is-one-third has-text-centered">
            <span className="icon is-large">
              <i className="fa fa-bank" style={{ fontSize: '48px', color: '#3273dc' }}></i>
            </span>
            <h3 className="title is-4">Own Your Data</h3>
            <p>Bring your data with you across all the internet. Your data isn't stuck anymore, it's on your domain on your terms.</p>
          </div>
          <div className="column is-one-third has-text-centered">
            <span className="icon is-large">
              <i className="fa fa-chain" style={{ fontSize: '48px', color: '#3273dc' }}></i>
            </span>
            <h3 className="title is-4">Data Freedom</h3>
            <p>Leverage web10 data with user consent. No more company gatekeeping to build integrated and relevant apps.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Team() {
  const members = [
    {
      name: 'Jacob Hoffman',
      role: 'Computer Engineer, X-IBMer',
      title: 'Founder',
      img: '/layouts/images/2022.jpg',
      link: 'https://jacobhoffman.xyz/resume.pdf',
    },
    {
      name: 'Slava Oks',
      role: 'VP of Research @ MongoDB',
      title: 'Advisor',
      img: '/layouts/images/slava.jpg',
      link: 'https://www.linkedin.com/in/slava-oks-6602323',
    },
  ]

  return (
    <section className="section" style={{ backgroundColor: '#f5f5f5' }}>
      <div className="container">
        <h2 className="title is-3 has-text-centered">Team</h2>
        <div className="columns is-centered">
          {members.map(m => (
            <div key={m.name} className="column is-one-third">
              <div className="card">
                <div className="card-image">
                  <figure className="image is-4by3">
                    <img src={m.img} alt={m.name} />
                  </figure>
                </div>
                <div className="card-content has-text-centered">
                  <p className="title is-5">{m.name}</p>
                  <p className="subtitle is-6">{m.role}</p>
                  <p className="subtitle is-6">{m.title}</p>
                  <a href={m.link} target="_blank" rel="noopener noreferrer">LinkedIn / Resume</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer" style={{ backgroundColor: '#1a1a2e', color: 'white' }}>
      <div className="container">
        <div className="columns">
          <div className="column is-one-third">
            <h4 className="title is-5">Contact Us</h4>
            <p>Email: jacob@web10.app</p>
          </div>
          <div className="column is-one-third">
            <h4 className="title is-5">Navigate</h4>
            <ul>
              <li><a href="/docs" style={{ color: 'white' }}>Docs</a></li>
              <li><a href="https://auth.web10.app" style={{ color: 'white' }}>Sign In</a></li>
            </ul>
          </div>
          <div className="column is-one-third">
            <h4 className="title is-5">Resources</h4>
            <p><a href="https://docs.web10.app/web10.pdf" style={{ color: '#3273dc' }}>Deck</a></p>
            <p>We are currently raising capital. Contact us if interested in investing.</p>
          </div>
        </div>
        <div className="has-text-centered" style={{ marginTop: '2rem' }}>
          <p>Copyright &copy; {new Date().getFullYear()} - All Rights Reserved - web10</p>
        </div>
      </div>
    </footer>
  )
}

function Home() {
  return (
    <>
      <section className="hero is-medium is-dark" style={{ backgroundImage: "url('/layouts/images/back2.jpg')", backgroundAttachment: 'fixed' }}>
        <div className="hero-overlay" />
        <div className="hero-body has-text-centered">
          <div className="container">
            <h1 className="title is-1">
              The web10 <span style={{ color: 'skyblue' }}>Revolution</span>
            </h1>
            <p className="subtitle" style={{ fontSize: '1.4rem', maxWidth: '700px', margin: '0 auto 2rem' }}>
              Use a web10 app. Sign up for an account. Get a domain name to start owning your photos, music, and data on the internet.
            </p>
            <a className="button is-primary is-large" href="https://auth.web10.app">
              Enter web10
            </a>
          </div>
        </div>
      </section>
      <Features />
      <Stats />
      <section className="section has-text-centered" style={{ backgroundColor: '#fafafa' }}>
        <div className="container">
          <blockquote style={{ fontSize: '1.3rem', fontStyle: 'italic', maxWidth: '600px', margin: '0 auto' }}>
            "We pledge to make an internet space in which users lead their internet destiny."
          </blockquote>
          <p className="has-text-grey mt-3">- web10 Team, 2022</p>
        </div>
      </section>
      <Team />
      <Footer />
    </>
  )
}

export default Home
