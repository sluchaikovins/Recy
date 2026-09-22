import { config } from './config.js';
import { createApp } from './app.js';
import { getDb } from './db/init.js';

getDb();

createApp().listen(config.port, () => {
  console.log(`Expense Tracker API слушает http://localhost:${config.port}`);
});
