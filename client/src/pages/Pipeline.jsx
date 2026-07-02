import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { STATUSES, sourceLabel, fmtGBP } from '../lib/constants.js';
import LeadDrawer from '../components/LeadDrawer.jsx';

export default function Pipeline({ user }) {
  const isAdmin = user.role === 'admin';
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [openLead, setOpenLead] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = clientId ? `?client_id=${clientId}` : '';
    const data = await api(`/api/leads${params}`);
    setLeads(data.leads);
  }, [clientId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (isAdmin) {
      api('/api/clients').then((d) => setClients(d.clients)).catch(() => {});
    }
  }, [isAdmin]);

  const moveLead = async (leadId, status) => {
    // Optimistic move so drag feels instant; reload confirms.
    setLeads((ls) => ls.map((l) => (l.id === leadId ? { ...l, status } : l)));
    try {
      await api(`/api/leads/${leadId}`, { method: 'PATCH', body: { status } });
    } catch (e) {
      setError(e.message);
    }
    load();
  };

  const onDrop = (e, status) => {
    e.preventDefault();
    setDragOver(null);
    const leadId = parseInt(e.dataTransfer.getData('text/lead-id'), 10);
    if (leadId) moveLead(leadId, status);
  };

  return (
    <>
      <div className="page-head">
        <h1>Pipeline</h1>
        {isAdmin && (
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
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

      <div className="kanban">
        {STATUSES.map((col) => {
          const colLeads = leads.filter((l) => l.status === col.key);
          const colValue = colLeads.reduce((s, l) => s + (Number(l.value_gbp) || 0), 0);
          return (
            <div
              key={col.key}
              className={`kanban-col ${dragOver === col.key ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver((d) => (d === col.key ? null : d))}
              onDrop={(e) => onDrop(e, col.key)}
            >
              <h3>
                <span>
                  {col.label} ({colLeads.length})
                </span>
                {colValue > 0 && <span>{fmtGBP(colValue)}</span>}
              </h3>
              {colLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="kanban-card"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/lead-id', String(lead.id))}
                  onClick={() => setOpenLead(lead.id)}
                >
                  <div className="lead-name">{lead.name}</div>
                  <div className="lead-sub">
                    {isAdmin && lead.company_name ? `${lead.company_name} · ` : ''}
                    {sourceLabel(lead.source)}
                  </div>
                  <div className="row2">
                    {/* Mobile-friendly fallback: move without drag & drop. */}
                    <select
                      value={lead.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => moveLead(lead.id, e.target.value)}
                      aria-label={`Move ${lead.name}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    {lead.value_gbp != null && <span className="value">{fmtGBP(lead.value_gbp)}</span>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {openLead && (
        <LeadDrawer leadId={openLead} onClose={() => setOpenLead(null)} onChanged={load} />
      )}
    </>
  );
}
