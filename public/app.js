import { createApp } from './js/browser.js';
import { initShell } from './js/shell.js';

const app = createApp();
initShell(app);
app.start();
