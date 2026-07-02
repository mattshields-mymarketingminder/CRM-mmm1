import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { sourceLabel, fmtGBP } from '../lib/constants.js';

const pct = (n) => `${(n * 100).toFixed(0)}%`;

export default function Reports({ user }) {
  const isAdmin = user.role === 'admin';
  const [report, setReport] = useState([]);
  const [totals, setTotals] = useState(null);
  const [clients, setClients] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', client_id: '' });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    const data = await api(`/api/reports/attribution?${params}`);
    setReport(data.report);
    setTotals(data.totals);
  }, [filters]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (isAdmin) {
      api('/api/clients').then((d) => setClients(d.clients)).catch(() => {});
    }
  }, [isAdmin]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const maxCount = Math.max(1, ...report.map((r) => r.lead_count));

  return (
    <>
      <div className="page-head">
        <h1>Attribution report</h1>
      </div>

      <div className="filters">
        <label className="field">
          From
          <input type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label className="field">
          To
          <input type="date" value={filters.to} onChange={set('to')} />
        </label>
        {isAdmin && (
          <label className="field">
            Client
            <select value={filters.client_id} onChange={set('client_id')}>
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      {totals && (
        <div className="stat-row">
          <div className="card stat">
            <div className="num">{totals.lead_count}</div>
            <div className="lbl">Leads</div>
          </div>
          <div className="card stat">
            <div className="num">{totals.sold_count}</div>
            <div className="lbl">Sold</div>
          </div>
          <div className="card stat">
            <div className="num">{pct(totals.conversion_rate)}</div>
            <div className="lbl">Conversion rate</div>
          </div>
          <div className="card stat">
            <div className="num">{fmtGBP(totals.sold_value_gbp)}</div>
            <div className="lbl">Revenue won</div>
          </div>
        </div>
      )}

      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Source</th>
              <th>Leads</th>
              <th className="hide-mobile">Volume</th>
              <th className="hide-mobile">Sold</th>
              <th>Conv. rate</th>
              <th className="hide-mobile">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {report.map((r) => (
              <tr key={r.source} style={{ cursor: 'default' }}>
                <td>
                  <span className="badge source">{sourceLabel(r.source)}</span>
                </td>
                <td>{r.lead_count}</td>
                <td className="hide-mobile" style={{ width: '22%' }}>
                  <div className="conv-bar">
                    <div style={{ width: pct(r.lead_count / maxCount) }} />
                  </div>
                </td>
                <td className="hide-mobile">{r.sold_count}</td>
                <td>{pct(r.conversion_rate)}</td>
                <td className="hide-mobile">{fmtGBP(r.sold_value_gbp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.length === 0 && (
          <div className="empty">No leads in this date range yet.</div>
        )}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        Conversion rate = leads marked Sold ÷ all leads from that source, within the selected dates.
      </p>
    </>
  );
}
