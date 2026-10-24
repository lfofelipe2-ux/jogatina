// Runs inside the sandbox image: starts the app in dev mode from /repo and saves full-page screenshots of
// each preview page on a phone and on a desktop into /repo/.preview-out.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// ESM ignores NODE_PATH; playwright is installed globally in the sandbox image.
const { chromium } = createRequire(`${process.env.NODE_PATH ?? '/usr/lib/node_modules'}/`)('playwright');

const BASE = 'http://127.0.0.1:5173';
const DEFAULT_PAGES = ['/', '/dev/mock', '/dev/mock?v=result'];
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
];
const MAX_PAGES = 5;

function extraPages() {
  const file = '/repo/.preview/pages.json';
  if (!existsSync(file)) return [];
  try {
    const list = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string' && p.startsWith('/')) : [];
  } catch {
    return [];
  }
}

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`dev server did not start: ${url}`);
}

const slug = (p) => (p === '/' ? 'home' : p.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')).slice(0, 40);

const devEnv = { ...process.env, LEDGER_DB_PATH: '/tmp/preview/ledger.db', PORT: '3000' };
const procs = [
  spawn('pnpm', ['--filter', '@poker/server', 'dev'], { cwd: '/repo', env: devEnv, stdio: 'ignore', detached: true }),
  // Explicit IPv4 host: on "localhost" Vite may bind only ::1.
  spawn('pnpm', ['--filter', '@poker/web', 'exec', 'vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: '/repo',
    env: devEnv,
    stdio: 'ignore',
    detached: true,
  }),
];
try {
  await waitFor(BASE, 120_000);
  mkdirSync('/repo/.preview-out', { recursive: true });
  const pages = [...new Set([...extraPages(), ...DEFAULT_PAGES])].slice(0, MAX_PAGES);
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const { name: _name, width, height, ...opts } = vp;
    const ctx = await browser.newContext({ viewport: { width, height }, ...opts });
    const page = await ctx.newPage();
    for (const p of pages) {
      await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `/repo/.preview-out/${slug(p)}-${vp.name}.png`, fullPage: true });
    }
    await ctx.close();
  }
  await browser.close();
} finally {
  for (const p of procs) {
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {}
  }
}
