import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { STATUSES, SOURCES, statusLabel, sourceLabel, fmtGBP, fmtDate } from '../lib/constants.js';
import LeadDrawer from '../components/LeadDrawer.jsx';
import NewLeadDrawer from '../components/NewLeadDrawer.jsx';

export default function LeadsList({ user }) {
  const isAdmin = user.role === 'admin';
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', source: '', client_id: '' });
  const [openLead, setOpenLead] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    const data = await api(`/api/leads?${params}`);
    setLeads(data.leads);
  }, [filters]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (isAdmin) {
      api('/api/clients').then((d) => setClients(d.clients)).catch(() => {});
    }
  }, [isAdmin]);

  const quickStatus = async (lead, status) => {
    await api(`/api/leads/${lead.id}`, { method: 'PATCH', body: { status } });
    load();
  };

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <div className="page-head">
        <h1>Leads</h1>
        <button className="btn" onClick={() => setAdding(true)}>
          + Add lead
        </button>
      </div>

      <div className="filters">
        <input placeholder="Search name or email…" value={filters.q} onChange={set('q')} />
        <select value={filters.status} onChange={set('status')}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={filters.source} onChange={set('source')}>
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        {isAdmin && (
          <select value={filters.client_id} onChange={set('client_id')}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Lead</th>
              {isAdmin && <th className="hide-mobile">Client</th>}
              <th className="hide-mobile">Source</th>
              <th>Status</th>
              <th className="hide-mobile">Value</th>
              <th className="hide-mobile">Created</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} onClick={() => setOpenLead(lead.id)}>
                <td>
                  <div className="lead-name">{lead.name}</div>
                  <div className="lead-sub">{lead.email || lead.phone || '—'}</div>
                </td>
                {isAdmin && <td className="hide-mobile">{lead.company_name}</td>}
                <td className="hide-mobile">
                  <span className="badge source">{sourceLabel(lead.source)}</span>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <select
                    value={lead.status}
                    onChange={(e) => quickStatus(lead, e.target.value)}
                    aria-label={`Status for ${lead.name}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="hide-mobile">{fmtGBP(lead.value_gbp)}</td>
                <td className="hide-mobile">{fmtDate(lead.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && <div className="empty">No leads match these filters yet.</div>}
      </div>

      {openLead && (
        <LeadDrawer leadId={openLead} onClose={() => setOpenLead(null)} onChanged={load} />
      )}
      {adding && (
        <NewLeadDrawer
          user={user}
          clients={clients}
          onClose={() => setAdding(false)}
          onCreated={load}
        />
      )}
    </>
  );
}
