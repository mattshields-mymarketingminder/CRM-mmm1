import { createApp } from './app.js';
import { migrate } from './migrate.js';
import { config } from './config.js';

const app = createApp();

migrate()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`MMM CRM API listening on :${config.port}`);
    });
  })
  .catch((err) => {
    console.error('Failed to apply schema:', err);
    process.exit(1);
  });
