import { Link, useLocation } from 'react-router-dom'

const navItems = [
  { path: '/', label: 'Home' },
  { path: '/docs', label: 'Docs' },
  { path: '/app-store', label: 'App Store' },
  { path: '/import', label: 'Import Your Life' },
]

function Navbar({ onReportBug }: { onReportBug: () => void }) {
  const location = useLocation()

  return (
    <nav className="navbar is-dark" role="navigation" aria-label="main navigation">
      <div className="container">
        <div className="navbar-brand">
          <Link className="navbar-item" to="/">
            <img src="/layouts/images/logo_white.png" style={{ height: '32px' }} alt="web10" />
          </Link>
          <a role="button" className="navbar-burger" aria-label="menu" aria-expanded="false" data-target="mainNav">
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
            <span aria-hidden="true"></span>
          </a>
        </div>
        <div id="mainNav" className="navbar-menu">
          <div className="navbar-start">
            {navItems.map(item => (
              <Link
                key={item.path}
                className={`navbar-item ${location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path)) ? 'is-active' : ''}`}
                to={item.path}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="navbar-end">
            <div className="navbar-item">
              <div className="buttons">
                <button className="button is-warning is-outlined" onClick={onReportBug}>
                  <span className="icon"><i className="fas fa-bug" /></span>
                  <span>Report bug</span>
                </button>
                <a className="button is-primary" href="https://auth.web10.app">
                  <strong>Sign In</strong>
                </a>
                <a className="button is-light" href="https://github.com/jacoby149/web10">
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
