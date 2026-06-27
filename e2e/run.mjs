// End-to-end test for the docker-react bootstrap flow (the PR gate).
//
// Proves the real runtime-injection path against the LOCAL working tree, not the
// published release:
//   1. pack the working-tree CLI and build the base image from it (tagged so the
//      generated consumer `FROM` resolves locally — no registry pull);
//   2. scaffold a fresh Vite app, run the local `init` against it;
//   3. docker build + docker run the app with an env var set;
//   4. drive the container with headless Playwright and assert the var reached
//      the browser via window.env AND the app rendered.
//
// See .tmp/e2e-prompt.md for the design and the two seams this redirects.

import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_PKG_DIR = path.join(REPO, 'e2e', 'local-pkg');
const CLI = path.join(REPO, 'bin', 'docker-react.js');

// Everything stays at v0.0.0: the repo package.json has no `version`, so the CLI's
// selfVersion falls back to 0.0.0 and `init` emits `FROM demery/docker-react:v0.0.0`.
// We tag the locally built base image to match so the unmodified FROM resolves locally.
const VERSION = '0.0.0';
const BASE_IMAGE = `demery/docker-react:v${VERSION}`;
const APP_IMAGE = 'docker-react-e2e-app:local';
const CONTAINER = 'docker-react-e2e';
const API_URL = 'https://x.test';
const HOST_PORT = 8099;
const ZOD_VERSION = '4.4.3';

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}${opts.cwd ? `  (in ${opts.cwd})` : ''}`);
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function capture(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim();
}

function quietly(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
  } catch {
    // best-effort cleanup; ignore failures
  }
}

async function packLocalCli() {
  console.log('\n=== Packing the working-tree CLI ===');
  run('npm', ['run', 'build'], { cwd: REPO });
  // Clear any stale tarball, give the package a version to pack, then restore.
  for (const f of await fs.readdir(LOCAL_PKG_DIR)) {
    if (f.endsWith('.tgz')) await fs.rm(path.join(LOCAL_PKG_DIR, f));
  }
  run('npm', ['pkg', 'set', `version=${VERSION}`], { cwd: REPO });
  try {
    run('npm', ['pack', '--pack-destination', LOCAL_PKG_DIR], { cwd: REPO });
  } finally {
    run('npm', ['pkg', 'delete', 'version'], { cwd: REPO });
  }
  const tarball = (await fs.readdir(LOCAL_PKG_DIR)).find((f) => f.endsWith('.tgz'));
  if (!tarball) throw new Error('npm pack produced no tarball');
  console.log(`packed ${tarball}`);
  return tarball;
}

function buildBaseImage(tarball) {
  console.log('\n=== Building the local base image ===');
  run('docker', [
    'build',
    '-t',
    BASE_IMAGE,
    '--build-arg',
    `DOCKER_REACT_SPEC=/tmp/dr-pkg/${tarball}`,
    REPO,
  ]);
}

async function scaffoldConsumer(tarball) {
  console.log('\n=== Scaffolding a fresh Vite app ===');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dr-e2e-'));
  const app = path.join(tmp, 'app');
  run('npm', ['create', 'vite@latest', 'app', '--', '--template', 'react-ts'], {
    cwd: tmp,
  });
  run('npm', ['install'], { cwd: app });
  // Step 1 (advisory) done as a real consumer would: local CLI tarball + exact zod.
  run('npm', ['install', '--save-exact', path.join(LOCAL_PKG_DIR, tarball), `zod@${ZOD_VERSION}`], {
    cwd: app,
  });
  return app;
}

async function initAndCustomise(app) {
  console.log('\n=== Running the local CLI init + check ===');
  run('node', [CLI, 'init'], { cwd: app });

  // Define a real schema field (init scaffolds it commented out) so prep validates
  // and exposes VITE_API_URL — this is what proves runtime injection.
  await fs.writeFile(
    path.join(app, 'env.schema.js'),
    `import { z } from 'zod';\n\nexport default z.object({\n  VITE_API_URL: z.url(),\n});\n`,
    'utf8',
  );

  // App reads the injected window.env so a rendered value proves the full path.
  await fs.writeFile(
    path.join(app, 'src', 'App.tsx'),
    `const env = (window as unknown as { env?: Record<string, string> }).env ?? {};\n\n` +
      `function App() {\n` +
      `  return <div data-testid="api-url">{env.VITE_API_URL}</div>;\n` +
      `}\n\n` +
      `export default App;\n`,
    'utf8',
  );

  run('node', [CLI, 'check'], { cwd: app });
}

function buildAndRunApp(app) {
  console.log('\n=== Building + running the consumer image ===');
  run('npm', ['run', 'build'], { cwd: app });
  run('docker', ['build', '-t', APP_IMAGE, app]);
  quietly('docker', ['rm', '-f', CONTAINER]);
  run('docker', [
    'run',
    '-d',
    '--name',
    CONTAINER,
    '-p',
    `${HOST_PORT}:80`,
    '-e',
    `VITE_API_URL=${API_URL}`,
    APP_IMAGE,
  ]);
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  // Dump container logs to aid debugging before failing.
  console.error(capture('docker', ['logs', CONTAINER]));
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function assertInjection() {
  console.log('\n=== Driving the container with headless Playwright ===');
  const url = `http://localhost:${HOST_PORT}/`;
  await waitForServer(url);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    const injected = await page.evaluate(() => window.env?.VITE_API_URL);
    if (injected !== API_URL) {
      throw new Error(
        `window.env.VITE_API_URL was ${JSON.stringify(injected)}, expected ${JSON.stringify(API_URL)}`,
      );
    }

    const rendered = (await page.getByTestId('api-url').textContent())?.trim();
    if (rendered !== API_URL) {
      throw new Error(
        `app rendered ${JSON.stringify(rendered)}, expected ${JSON.stringify(API_URL)}`,
      );
    }
    console.log(`✓ window.env.VITE_API_URL === ${API_URL} and the app rendered it`);
  } finally {
    await browser.close();
  }
}

async function cleanup() {
  console.log('\n=== Cleanup ===');
  quietly('docker', ['rm', '-f', CONTAINER]);
  for (const f of await fs.readdir(LOCAL_PKG_DIR).catch(() => [])) {
    if (f.endsWith('.tgz')) await fs.rm(path.join(LOCAL_PKG_DIR, f)).catch(() => {});
  }
}

async function main() {
  try {
    const tarball = await packLocalCli();
    buildBaseImage(tarball);
    const app = await scaffoldConsumer(tarball);
    await initAndCustomise(app);
    buildAndRunApp(app);
    await assertInjection();
    console.log('\n✅ e2e passed');
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(`\n❌ e2e failed: ${err.message}`);
  process.exitCode = 1;
});
