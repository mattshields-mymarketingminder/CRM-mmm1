import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { STATUSES, SOURCES, fmtDateTime } from '../lib/constants.js';

export default function LeadDrawer({ leadId, onClose, onChanged }) {
  const [lead, setLead] = useState(null);
  const [activities, setActivities] = useState([]);
  const [form, setForm] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const data = await api(`/api/leads/${leadId}`);
    setLead(data.lead);
    setActivities(data.activities);
    setForm({
      name: data.lead.name,
      email: data.lead.email || '',
      phone: data.lead.phone || '',
      notes: data.lead.notes || '',
      source: data.lead.source,
      status: data.lead.status,
      value_gbp: data.lead.value_gbp ?? '',
    });
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [leadId]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api(`/api/leads/${leadId}`, {
        method: 'PATCH',
        body: { ...form, value_gbp: form.value_gbp === '' ? null : Number(form.value_gbp) },
      });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api(`/api/leads/${leadId}/notes`, { method: 'POST', body: { text: note } });
      setNote('');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this lead permanently?')) return;
    await api(`/api/leads/${leadId}`, { method: 'DELETE' });
    onChanged?.();
    onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        {!form ? (
          <p>{error || 'Loading…'}</p>
        ) : (
          <>
            <div className="close-row">
              <h2>{lead.name}</h2>
              <button className="btn secondary" onClick={onClose}>
                Close
              </button>
            </div>
            {lead.company_name && <div className="hint">{lead.company_name}</div>}
            {(lead.utm_source || lead.utm_campaign) && (
              <div className="hint">
                UTM: {[lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ')}
              </div>
            )}
            {error && <div className="error-box">{error}</div>}

            <form onSubmit={save}>
              <div className="form-grid">
                <label className="field full">
                  Name
                  <input value={form.name} onChange={set('name')} required />
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
                  Value (£)
                  <input type="number" min="0" step="0.01" value={form.value_gbp} onChange={set('value_gbp')} />
                </label>
                <label className="field full">
                  Notes
                  <textarea rows="2" value={form.notes} onChange={set('notes')} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" disabled={busy}>
                  Save changes
                </button>
                <button type="button" className="btn danger" onClick={remove}>
                  Delete
                </button>
              </div>
            </form>

            <h3 style={{ marginTop: 26 }}>Activity</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ flex: 1 }}
                placeholder="Add a note…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addNote())}
              />
              <button className="btn secondary" onClick={addNote} disabled={busy || !note.trim()}>
                Add
              </button>
            </div>
            <ul className="timeline">
              {activities.map((a) => (
                <li key={a.id}>
                  <div>{a.detail}</div>
                  <div className="when">
                    {fmtDateTime(a.created_at)}
                    {a.user_email ? ` · ${a.user_name || a.user_email}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
