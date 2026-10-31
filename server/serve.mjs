// Zero-dependency local production server for Wizened Wizards.
// Serves ./dist on 127.0.0.1 only, picks a free port, and optionally opens the browser.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', 'dist');
const args = process.argv.slice(2);
const OPEN = args.includes('--open');
const portArg = args.find((a) => a.startsWith('--port='));
const START_PORT = portArg ? Number(portArg.split('=')[1]) : 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('\n[Wizened Wizards] The game has not been built yet.');
  console.error('  Expected: ' + path.join(ROOT, 'index.html'));
  console.error('  Run SETUP_WIZENED_WIZARDS.cmd (Windows) or "npm install" then "npm run build".\n');
  process.exit(2);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let target = file;
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) target = path.join(ROOT, 'index.html');
    const ext = path.extname(target).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };
    res.writeHead(200, headers);
    fs.createReadStream(target).pipe(res);
  } catch (e) {
    res.writeHead(500).end('Server error');
    console.error(e);
  }
});

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'win32') spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
    else if (platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    console.log('Open this address in your browser: ' + url);
  }
}

function listen(port, attempts = 0) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempts < 30) listen(port + 1, attempts + 1);
    else {
      console.error('[Wizened Wizards] Could not start the local server: ' + err.message);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log('\n  WIZENED WIZARDS is running at ' + url);
    console.log('  Keep this window open while you play. Close it (or press Ctrl+C) to stop.\n');
    if (OPEN) openBrowser(url);
  });
}

listen(START_PORT);
