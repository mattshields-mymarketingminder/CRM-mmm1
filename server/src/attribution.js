// Lead statuses shipped by default (brief: clients can customise labels later).
export const STATUSES = ['new', 'contacted', 'qualified', 'not_qualified', 'sold', 'lost'];

// Known source tags. Web-form leads are auto-attributed from UTM params;
// phone/walk-in leads are tagged manually in the dashboard.
export const SOURCES = [
  'google_ads',
  'meta_ads',
  'organic',
  'referral',
  'website_form',
  'manual',
  'other',
];

const PAID_MEDIUMS = new Set(['cpc', 'ppc', 'paid', 'paidsocial', 'paid_social', 'paid-social', 'cpm']);

/**
 * Derive a source tag from UTM parameters on a form submission.
 * Falls back to 'website_form' when a form lead has no usable UTMs.
 */
export function attributeSource({ utm_source, utm_medium } = {}) {
  const src = (utm_source || '').toLowerCase().trim();
  const medium = (utm_medium || '').toLowerCase().trim();

  if (src.includes('google')) {
    return PAID_MEDIUMS.has(medium) ? 'google_ads' : 'organic';
  }
  if (['facebook', 'fb', 'instagram', 'ig', 'meta'].some((s) => src.includes(s))) {
    return PAID_MEDIUMS.has(medium) ? 'meta_ads' : 'organic';
  }
  if (medium === 'organic' || src.includes('bing') || src.includes('duckduckgo')) {
    return 'organic';
  }
  if (medium === 'referral' || src === 'referral') {
    return 'referral';
  }
  if (src || medium) {
    return 'other';
  }
  return 'website_form';
}
