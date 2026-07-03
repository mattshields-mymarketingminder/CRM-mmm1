const isTest = process.env.NODE_ENV === 'test';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    (isTest
      ? 'postgresql://mmm:mmm_dev_pw@localhost:5432/mmm_crm_test'
      : 'postgresql://mmm:mmm_dev_pw@localhost:5432/mmm_crm'),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Public origin the app is served from, used in webhook URLs shown to clients.
  publicUrl: process.env.PUBLIC_URL || 'https://crm.mymarketingminder.com',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),

  // Landing-page auditor (public tool: POST /api/audit, POST /api/leads/audit)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
  brevoApiKey: process.env.BREVO_API_KEY,
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL,
  brevoReplyEmail: process.env.BREVO_REPLY_EMAIL,
  // Paste the full service-account JSON (minified, one line) as the value —
  // not a file path. googleapis reads it via `credentials`, see routes/audit.js.
  googleServiceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  googleAuditSheetId: process.env.GOOGLE_AUDIT_SHEET_ID,
};
