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
};
