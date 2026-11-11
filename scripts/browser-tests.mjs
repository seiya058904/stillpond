// Build first. Each suite runs against one temporary production preview, with
// isolated browser contexts and evidence outside the source checkout.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import project from '../project.config.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.env.QA_SCREENSHOT_DIR ? path.resolve(process.env.QA_SCREENSHOT_DIR)
  : await mkdtemp(path.join(tmpdir(), 'stillpond-browser-'));
const relative = path.relative(root, out);
if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) {
  throw new Error('QA_SCREENSHOT_DIR must be outside the repository.');
}
await mkdir(out, { recursive: true });
const server = await preview({ root, mode: 'production', preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false } });
const address = server.httpServer.address();
const url = `http://127.0.0.1:${address.port}${new URL(project.siteUrl).pathname}`;
console.log(`Browser acceptance: ${url}\nEvidence: ${out}`);
let child;
let interrupted = false;
const interrupt = () => { interrupted = true; child?.kill(); };
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
const results = [];
try {
  for (const suite of ['browser-settings.mjs', 'browser-settings-ui.mjs', 'browser-interactions.mjs']) {
    if (interrupted) throw new Error('Browser acceptance interrupted');
    let log = '';
    let timedOut = false;
    child = spawn(process.execPath, [path.join(root, 'scripts', suite)], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, QA_FISH_URL: url, QA_SCREENSHOT_DIR: out },
    });
    const capture = chunk => { log += chunk; process.stdout.write(chunk); };
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 300_000);
    let code;
    try {
      code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    } finally {
      clearTimeout(timer);
      child = undefined;
      await writeFile(path.join(out, `${suite}.log`), log);
    }
    results.push({ suite, code, timedOut });
    if (code !== 0 || timedOut || interrupted) throw new Error(`${suite} failed${timedOut ? ' (5 minute timeout)' : ''}; see ${out}`);
  }
} finally {
  process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
  await writeFile(path.join(out, 'browser-summary.json'), JSON.stringify({ url, results }, null, 2));
  server.httpServer.closeAllConnections();
  await new Promise(resolve => server.httpServer.close(resolve));
}
