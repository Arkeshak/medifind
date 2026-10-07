import { useEffect, useState } from 'react';
import { getUser, login, logout } from './auth';
import SearchPage from './components/SearchPage.jsx';
import DashboardPage from './components/DashboardPage.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('search');

  useEffect(() => {
    getUser().then((u) => { setUser(u); setChecking(false); });
  }, []);

  const displayName = user?.name || user?.given_name || user?.email || user?.username || 'Staff';

  return (
    <div className="app">
      <header className="header">
        <div className="brand">💊 MediFind</div>
        <nav className="tabs">
          <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>
            Find Medicine
          </button>
          {user && (
            <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
              Pharmacy Dashboard
            </button>
          )}
        </nav>
        <div className="auth">
          {checking ? null : user ? (
            <>
              <span className="user">Hi, {displayName}</span>
              <button className="secondary" onClick={logout}>Log out</button>
            </>
          ) : (
            <button onClick={login}>Pharmacy Login</button>
          )}
        </div>
      </header>

      <main className="content">
        {tab === 'dashboard' && user ? <DashboardPage /> : <SearchPage />}
      </main>

      <footer className="footer">MediFind · Built on WSO2 Choreo</footer>
    </div>
  );
}
