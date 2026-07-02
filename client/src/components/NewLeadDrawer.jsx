import { useState } from 'react';
import { api } from '../lib/api.js';
import { STATUSES, SOURCES } from '../lib/constants.js';

export default function NewLeadDrawer({ user, clients, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
    source: 'manual',
    status: 'new',
    value_gbp: '',
    client_id: clients?.[0]?.id || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/api/leads', {
        method: 'POST',
        body: { ...form, value_gbp: form.value_gbp === '' ? null : Number(form.value_gbp) },
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="close-row">
          <h2>Add lead</h2>
          <button className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <div className="error-box">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            {user.role === 'admin' && (
              <label className="field full">
                Client
                <select value={form.client_id} onChange={set('client_id')} required>
                  <option value="">Select client…</option>
                  {(clients || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field full">
              Name
              <input value={form.name} onChange={set('name')} required autoFocus />
            </label>
            <label className="field">
              Email
              <input type="email" value={form.email} onChange={set('email')} />
            </label>
            <label className="field">
              Phone
              <input value={form.phone} onChange={set('phone')} />
            </label>
            <label className="field">
              Source
              <select value={form.source} onChange={set('source')}>
                {SOURCES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Status
              <select value={form.status} onChange={set('status')}>
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Value (£)
              <input type="number" min="0" step="0.01" value={form.value_gbp} onChange={set('value_gbp')} />
            </label>
            <label className="field full">
              Notes
              <textarea rows="2" value={form.notes} onChange={set('notes')} />
            </label>
          </div>
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Create lead'}
          </button>
        </form>
      </div>
    </div>
  );
}
