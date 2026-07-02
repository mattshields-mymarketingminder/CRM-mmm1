export const STATUSES = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'not_qualified', label: 'Not Qualified' },
  { key: 'sold', label: 'Sold' },
  { key: 'lost', label: 'Lost' },
];

export const SOURCES = [
  { key: 'google_ads', label: 'Google Ads' },
  { key: 'meta_ads', label: 'Meta Ads' },
  { key: 'organic', label: 'Organic / SEO' },
  { key: 'referral', label: 'Referral' },
  { key: 'website_form', label: 'Website Form' },
  { key: 'manual', label: 'Manual Entry' },
  { key: 'other', label: 'Other' },
];

export const statusLabel = (key) => STATUSES.find((s) => s.key === key)?.label || key;
export const sourceLabel = (key) => SOURCES.find((s) => s.key === key)?.label || key;

export const fmtGBP = (n) =>
  n == null || n === ''
    ? '—'
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);

export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const fmtDateTime = (d) =>
  new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
