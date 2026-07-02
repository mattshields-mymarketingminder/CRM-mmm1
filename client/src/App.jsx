import { useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { getToken, getStoredUser, clearSession } from './lib/api.js';
import Login from './pages/Login.jsx';
import LeadsList from './pages/LeadsList.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Reports from './pages/Reports.jsx';
import Clients from './pages/Clients.jsx';

function Shell({ user, onLogout, children }) {
  const isAdmin = user.role === 'admin';
  return (
    <div data-theme={isAdmin ? 'admin' : 'client'}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="/logo.png" alt="My Marketing Minder" />
            <span>
              {isAdmin ? 'my marketing minder' : user.company_name || 'CRM'}
              {isAdmin && <span className="tenant"> · agency admin</span>}
            </span>
          </div>
          <nav className="main-nav">
            <NavLink to="/leads">Leads</NavLink>
            <NavLink to="/pipeline">Pipeline</NavLink>
            <NavLink to="/reports">Reports</NavLink>
            {isAdmin && <NavLink to="/clients">Clients</NavLink>}
          </nav>
          <div className="user-box">
            <span className="user-email">{user.email}</span>
            <button className="btn-link" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getStoredUser());
  const authed = Boolean(getToken() && user);

  const handleLogout = () => {
    clearSession();
    setUser(null);
    navigate('/login');
  };

  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Shell user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/leads" element={<LeadsList user={user} />} />
        <Route path="/pipeline" element={<Pipeline user={user} />} />
        <Route path="/reports" element={<Reports user={user} />} />
        {user.role === 'admin' && <Route path="/clients" element={<Clients />} />}
        <Route path="*" element={<Navigate to="/leads" replace />} />
      </Routes>
    </Shell>
  );
}
