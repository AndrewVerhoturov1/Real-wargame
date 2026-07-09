import { execFile, spawn } from 'node:child_process';
import http from 'node:http';
import process from 'node:process';

const LAB_MANAGER_PORT = 8799;
const APP_PORT = 5173;
const ENGINE_PORT = 8787;
const HOST = '127.0.0.1';

const childProcesses = new Map();
let shuttingDown = false;

await killPorts([APP_PORT, ENGINE_PORT]);
startChildProcess('npm run engine:dev', 'npm', ['run', 'engine:dev']);
startChildProcess('npm run dev', 'npm', ['run', 'dev']);

const server = http.createServer((request, response) => {
  writeCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', `http://${HOST}:${LAB_MANAGER_PORT}`);

  if (url.pathname === '/lab/health') {
    writeJson(response, 200, {
      ok: true,
      service: 'real-wargame-lab-manager',
      ports: { manager: LAB_MANAGER_PORT, app: APP_PORT, engine: ENGINE_PORT },
      processes: listProcesses(),
      shuttingDown,
    });
    return;
  }

  if (url.pathname === '/lab/open') {
    const target = url.searchParams.get('target') === 'editor' ? 'editor' : 'game';
    const targetUrl = target === 'editor' ? `http://${HOST}:${APP_PORT}/ai-node-editor.html` : `http://${HOST}:${APP_PORT}/`;
    openBrowser(targetUrl);
    writeJson(response, 200, { ok: true, opened: target, url: targetUrl });
    return;
  }

  if (url.pathname === '/lab/shutdown') {
    writeJson(response, 200, { ok: true, shuttingDown: true });
    setTimeout(() => { void shutdownLab(); }, 150);
    return;
  }

  writeJson(response, 404, { ok: false, error: 'not_found' });
});

server.listen(LAB_MANAGER_PORT, HOST);

process.on('SIGINT', () => { void shutdownLab(); });
process.on('SIGTERM', () => { void shutdownLab(); });
process.on('exit', stopChildren);

function startChildProcess(label, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    shell: true,
    windowsHide: true,
    detached: false,
    stdio: 'ignore',
    env: { ...process.env, BROWSER: 'none' },
  });

  childProcesses.set(label, child);
  child.on('exit', () => childProcesses.delete(label));
  return child;
}

function listProcesses() {
  return [...childProcesses.entries()].map(([label, child]) => ({ label, pid: child.pid ?? null, killed: child.killed }));
}

async function shutdownLab() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopChildren();
  await killPorts([APP_PORT, ENGINE_PORT]);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1200).unref();
}

function stopChildren() {
  for (const child of childProcesses.values()) {
    if (child.pid) {
      taskkillPid(child.pid);
    }
  }
  childProcesses.clear();
}

function taskkillPid(pid) {
  execFile('taskkill.exe', ['/F', '/T', '/PID', String(pid)], { windowsHide: true }, () => undefined);
}

function killPorts(ports) {
  const portList = ports.join(',');
  const script = [
    `$ports=@(${portList});`,
    'foreach($p in $ports){',
    '  Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |',
    '    Where-Object { $_.OwningProcess -and $_.OwningProcess -ne $PID } |',
    '    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }',
    '}',
  ].join(' ');

  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true }, () => resolve());
  });
}

function openBrowser(url) {
  execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }, () => undefined);
}

function writeCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}
