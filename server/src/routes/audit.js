import { Router } from 'express';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { google } from 'googleapis';
import { config } from '../config.js';
import { query } from '../db.js';
import { auditRateLimiter } from '../rateLimit.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

// Google Sheets client is built lazily so a missing/invalid service account
// key disables sheet sync instead of crashing the server on boot.
let sheetsClient = null;
function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  if (!config.googleServiceAccountKey) return null;
  try {
    const credentials = JSON.parse(config.googleServiceAccountKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (err) {
    console.error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY (expected the service account JSON, not a file path):', err.message);
    return null;
  }
}

/**
 * PUBLIC. Mounted at POST /api/audit (see app.js).
 * Fetches a URL's HTML and asks Claude to score it on 8 conversion factors.
 * Powers the public landing-page-audit tool — no CRM login required.
 */

// Common markers seen on captcha / bot-protection interstitials (Cloudflare,
// Incapsula, PerimeterX, generic "verify you are human" pages, etc). If the
// fetched HTML matches one of these instead of real page content, the target
// site is blocking the audit rather than the audit genuinely failing.
const BOT_CHALLENGE_PATTERNS = [
  /captcha/i,
  /are you a human/i,
  /verify you are human/i,
  /checking your browser/i,
  /just a moment/i,
  /cf-browser-verification/i,
  /cf-chl-/i,
  /attention required[\s\S]{0,200}cloudflare/i,
  /access denied/i,
  /request unsuccessful[\s\S]{0,200}incapsula/i,
  /distil_r_captcha/i,
  /perimeterx/i,
  /ddos protection by/i,
  /security check/i,
  /unusual traffic/i,
  /automated (queries|requests)/i,
];

function looksLikeBotChallenge(html) {
  return typeof html === 'string' && BOT_CHALLENGE_PATTERNS.some((pattern) => pattern.test(html));
}

export const auditRouter = Router();

auditRouter.post('/', auditRateLimiter, async (req, res, next) => {
  try {
    const { url, pageType } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL is required' });

    let htmlContent;
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        maxContentLength: 2_000_000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
      });

      const rawHtml = String(response.data);
      if (looksLikeBotChallenge(rawHtml)) {
        return res.status(422).json({
          blocked: true,
          error:
            "This site appears to be blocking automated requests (a captcha or bot-protection page was returned instead of the real page). Try again later, or check your site's security/firewall settings to allow the audit tool through.",
        });
      }

      htmlContent = rawHtml.slice(0, 8000);
    } catch (fetchErr) {
      const errorHtml = String(fetchErr.response?.data ?? '');
      if (looksLikeBotChallenge(errorHtml)) {
        return res.status(422).json({
          blocked: true,
          error:
            "This site appears to be blocking automated requests (a captcha or bot-protection page was returned instead of the real page). Try again later, or check your site's security/firewall settings to allow the audit tool through.",
        });
      }
      return res.status(400).json({ error: `Could not fetch website: ${fetchErr.message}` });
    }

    const analysisPrompt = `You are a landing page conversion expert. Analyze this website HTML and score it on 8 key conversion factors.
Website URL: ${url}
Page Type: ${pageType || 'unspecified'}
HTML Content (first 8KB):
${htmlContent}

Score each factor 0-100 and provide your analysis. Return ONLY valid JSON, no markdown formatting:
{
  "scores": {
    "headline": <0-100>,
    "cta": <0-100>,
    "formPresence": <0-100>,
    "mobile": <0-100>,
    "socialProof": <0-100>,
    "urgency": <0-100>,
    "copyTone": <0-100>,
    "visualHierarchy": <0-100>
  },
  "overallScore": <average of all scores>,
  "strengths": ["<1-2 word strength>", "<1-2 word strength>"],
  "improvements": ["<actionable improvement>", "<actionable improvement>"],
  "recommendation": "<single most impactful change they could make>"
}`;

    const message = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: 1024,
      messages: [{ role: 'user', content: analysisPrompt }],
    });

    const analysisText = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .replace(/```json\n?|```\n?/g, '')
      .trim();

    let results;
    try {
      results = JSON.parse(analysisText);
    } catch (parseErr) {
      console.error('Claude returned a non-JSON audit response:', analysisText);
      return res.status(502).json({ error: 'Analysis format error' });
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
});

/**
 * PUBLIC. Mounted at POST /api/leads/audit — registered in app.js BEFORE the
 * authenticated `/api/leads` router, so these requests never hit requireAuth.
 * Saves an audit-tool prospect: DB row is the source of truth, then
 * best-effort Brevo report email + best-effort Google Sheet log (neither
 * failure should fail the lead save itself).
 */
export const auditLeadsRouter = Router();

auditLeadsRouter.post('/', auditRateLimiter, async (req, res, next) => {
  try {
    const {
      name,
      businessName,
      website,
      email,
      phone,
      pageType,
      auditResults,
      timestamp,
      manualAuditNeeded,
    } = req.body || {};
    if (!email || !businessName) {
      return res.status(400).json({ error: 'Email and business name required' });
    }
    // Set by the frontend when the automated /api/audit scan came back
    // `blocked: true` (captcha/bot-protection) — no score exists yet, so
    // this becomes a follow-up-personally lead instead of a report lead.
    const needsManualAudit = Boolean(manualAuditNeeded);

    const { rows } = await query(
      `INSERT INTO audit_leads
        (name, business_name, website, email, phone, page_type, overall_score, scores, strengths, improvements, recommendation, manual_audit_needed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        name || null,
        businessName,
        website || null,
        email,
        phone || null,
        pageType || null,
        auditResults?.overallScore ?? null,
        auditResults?.scores ? JSON.stringify(auditResults.scores) : null,
        auditResults?.strengths ? JSON.stringify(auditResults.strengths) : null,
        auditResults?.improvements ? JSON.stringify(auditResults.improvements) : null,
        auditResults?.recommendation || null,
        needsManualAudit,
      ]
    );
    const leadId = rows[0].id;

    let brevoSent = false;
    if (config.brevoApiKey) {
      try {
        await axios.post(
          'https://api.brevo.com/v3/smtp/email',
          {
            to: [{ email, name }],
            sender: { email: config.brevoSenderEmail, name: 'My Marketing Minder' },
            replyTo: { email: config.brevoReplyEmail },
            subject: needsManualAudit
              ? `We're on it - your manual audit for ${businessName}`
              : `Your Landing Page Audit Report - ${businessName}`,
            htmlContent: needsManualAudit
              ? buildManualAuditEmailHtml({ businessName, website })
              : buildAuditEmailHtml({ businessName, website, auditResults }),
          },
          { headers: { 'api-key': config.brevoApiKey, 'Content-Type': 'application/json' } }
        );
        brevoSent = true;
      } catch (brevoErr) {
        console.error('Brevo email failed:', brevoErr.response?.data || brevoErr.message);
      }
    }

    let sheetSynced = false;
    const sheets = getSheetsClient();
    if (sheets && config.googleAuditSheetId) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: config.googleAuditSheetId,
          range: 'Leads!A:K',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[
              new Date(timestamp || Date.now()).toLocaleString(),
              name || '',
              businessName,
              email,
              phone || 'N/A',
              website || '',
              pageType || '',
              auditResults?.overallScore ?? '',
              auditResults?.scores?.cta ?? '',
              auditResults?.scores?.formPresence ?? '',
              needsManualAudit ? 'Manual audit needed' : 'Pending follow-up',
            ]],
          },
        });
        sheetSynced = true;
      } catch (sheetErr) {
        console.error('Sheet logging failed:', sheetErr.message);
      }
    }

    await query('UPDATE audit_leads SET brevo_sent = $1, sheet_synced = $2 WHERE id = $3', [
      brevoSent,
      sheetSynced,
      leadId,
    ]);

    res.json({ success: true, message: 'Lead saved', email, leadId, manualAuditNeeded: needsManualAudit });
  } catch (err) {
    next(err);
  }
});

function buildManualAuditEmailHtml({ businessName, website }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #EBC522; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 30px; }
        .box { background: #f5f5f5; padding: 20px; border-left: 4px solid #EBC522; margin: 20px 0; }
        .cta { background: #2C2406; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; color: #2C2406;">We\'re On It</h1>
          <p style="margin: 10px 0 0 0; color: #2C2406;">${businessName}</p>
        </div>
        <div class="box">
          <p>Thanks for requesting a landing page audit${website ? ` for <strong>${website}</strong>` : ''}.</p>
          <p>Your site\'s security settings blocked our automated scanner — which is
          actually a good sign, since it means you take security seriously. It does
          mean we couldn\'t generate an instant score, though.</p>
          <p><strong>I\'ll personally review your site and send you a detailed audit
          report within 24 hours.</strong></p>
        </div>
        <p>In the meantime, if there\'s anything specific you\'d like me to look at,
        just reply to this email.</p>
        <a href="https://mymarketingminder.com/consultation" class="cta">Book a Strategy Call</a>
        <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666; text-align: center;">
          My Marketing Minder • Edinburgh, Scotland<br>
          ${website || ''}
        </p>
      </div>
    </body>
    </html>`;
}

function buildAuditEmailHtml({ businessName, website, auditResults }) {
  const s = auditResults?.scores || {};
  const metric = (label, value) => `<div class="metric"><span>${label}</span><strong>${value ?? '—'}</strong></div>`;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; color: #333; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #EBC522; padding: 20px; text-align: center; border-radius: 8px; margin-bottom: 30px; }
        .score-box { background: #f5f5f5; padding: 20px; border-left: 4px solid #EBC522; margin: 20px 0; }
        .metric { display: flex; justify-content: space-between; margin: 10px 0; }
        .strength { color: #22863a; }
        .improvement { color: #d73a49; }
        .cta { background: #2C2406; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; color: #2C2406;">Landing Page Audit Report</h1>
          <p style="margin: 10px 0 0 0; color: #2C2406;">${businessName}</p>
        </div>
        <h2>Your Overall Score: ${auditResults?.overallScore ?? '—'}/100</h2>
        <div class="score-box">
          <h3>Category Breakdown</h3>
          ${metric('Headline Strength', s.headline)}
          ${metric('CTA Clarity', s.cta)}
          ${metric('Lead Capture Form', s.formPresence)}
          ${metric('Mobile Experience', s.mobile)}
          ${metric('Social Proof', s.socialProof)}
          ${metric('Urgency Signals', s.urgency)}
          ${metric('Copy Tone', s.copyTone)}
          ${metric('Visual Hierarchy', s.visualHierarchy)}
        </div>
        <div class="score-box">
          <h3>What's Working Well</h3>
          ${(auditResults?.strengths || []).map((x) => `<p class="strength">✓ ${x}</p>`).join('')}
        </div>
        <div class="score-box">
          <h3>Quick Wins to Implement</h3>
          ${(auditResults?.improvements || []).map((x) => `<p class="improvement">→ ${x}</p>`).join('')}
        </div>
        <div class="score-box">
          <h3>Top Priority</h3>
          <p><strong>${auditResults?.recommendation || '—'}</strong></p>
        </div>
        <p>Ready to improve your conversion rate? Let's chat about how we can help.</p>
        <a href="https://mymarketingminder.com/consultation" class="cta">Book a Strategy Call</a>
        <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;">
        <p style="font-size: 12px; color: #666; text-align: center;">
          My Marketing Minder • Edinburgh, Scotland<br>
          ${website || ''}
        </p>
      </div>
    </body>
    </html>`;
}
