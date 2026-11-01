import { startDaemon } from './server.js';

console.log('Starting JARVIS-OS daemon...');
const daemon = await startDaemon();
console.log('Daemon running. Press Ctrl+C to stop.');

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await daemon.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await daemon.close();
  process.exit(0);
});