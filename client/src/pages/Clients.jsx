import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [userForm, setUserForm] = useState(null); // { clientId, email, password, name }
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = () => api('/api/clients').then((d) => setClients(d.clients)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const createClient = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/api/clients', { method: 'POST', body: { company_name: companyName } });
      setCompanyName('');
      setMessage('Client created.');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api(`/api/clients/${userForm.clientId}/users`, {
        method: 'POST',
        body: { email: userForm.email, password: userForm.password, name: userForm.name },
      });
      setMessage(`Login created for ${userForm.email}.`);
      setUserForm(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    setMessage('Webhook URL copied to clipboard.');
  };

  return (
    <>
      <div className="page-head">
        <h1>Clients</h1>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>
          {message}
        </div>
      )}

      <form className="filters" onSubmit={createClient}>
        <input
          placeholder="New client company name…"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
        />
        <button className="btn">+ Add client</button>
      </form>

      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Company</th>
              <th>Leads</th>
              <th>Sold</th>
              <th className="hide-mobile">Form webhook</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} style={{ cursor: 'default' }}>
                <td className="lead-name">{c.company_name}</td>
                <td>{c.lead_count}</td>
                <td>{c.sold_count}</td>
                <td className="hide-mobile">
                  <code className="inline">{c.webhook_url}</code>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn secondary" onClick={() => copy(c.webhook_url)}>
                    Copy URL
                  </button>{' '}
                  <button
                    className="btn secondary"
                    onClick={() =>
                      setUserForm({ clientId: c.id, company: c.company_name, email: '', password: '', name: '' })
                    }
                  >
                    Add login
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {clients.length === 0 && <div className="empty">No clients yet — add your first above.</div>}
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        Point each client's website form at their webhook URL (POST, JSON or form-encoded). Include
        any <code className="inline">utm_source / utm_medium / utm_campaign</code> fields and leads
        will be auto-attributed.
      </p>

      {userForm && (
        <div className="overlay" onClick={() => setUserForm(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="close-row">
              <h2>Add login — {userForm.company}</h2>
              <button className="btn secondary" onClick={() => setUserForm(null)}>
                Close
              </button>
            </div>
            <form onSubmit={createUser}>
              <div className="form-grid">
                <label className="field full">
                  Name
                  <input
                    value={userForm.name}
                    onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label className="field full">
                  Email
                  <input
                    type="email"
                    required
                    value={userForm.email}
                    onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <label className="field full">
                  Password (min 8 characters)
                  <input
                    type="text"
                    required
                    minLength={8}
                    value={userForm.password}
                    onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </label>
              </div>
              <button className="btn">Create login</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
