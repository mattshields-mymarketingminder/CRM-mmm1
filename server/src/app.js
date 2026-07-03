import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { clientsRouter } from './routes/clients.js';
import { leadsRouter } from './routes/leads.js';
import { reportsRouter } from './routes/reports.js';
import { ingestRouter } from './routes/ingest.js';
import { auditRouter, auditLeadsRouter } from './routes/audit.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/clients', clientsRouter);
  // Public landing-page-audit tool. Both must be mounted BEFORE
  // '/api/leads' below — leadsRouter applies requireAuth to everything
  // under it, and these two endpoints are intentionally unauthenticated.
  app.use('/api/audit', auditRouter);
  app.use('/api/leads/audit', auditLeadsRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/ingest', ingestRouter);

  // Serve the built React app in production (single-service deploy).
  const clientDist = join(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(clientDist, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
