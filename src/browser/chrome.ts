import { execSync, spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';

export interface ChromeLaunchOptions {
  port?: number;
  userDataDir?: string;
  headless?: boolean;
}

export function findChromePath(): string | null {
  const platform = os.platform();
  const candidates: string[] = [];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      path.join(os.homedir(), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    );
  } else if (platform === 'win32') {
    candidates.push(
      path.join(process.env['PROGRAMFILES'] || '', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env['LOCALAPPDATA'] || '', 'Google/Chrome/Application/chrome.exe'),
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    );
  }

  for (const candidate of candidates) {
    try {
      if (platform === 'win32') {
        execSync(`where "${candidate}"`, { stdio: 'ignore' });
        return candidate;
      } else {
        execSync(`test -x "${candidate}"`, { stdio: 'ignore' });
        return candidate;
      }
    } catch {
      // continue
    }
  }
  return null;
}

export function isPortInUse(port: number): boolean {
  try {
    execSync(`lsof -i:${port} -t`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function killChromeOnPort(port: number): void {
  try {
    const pids = execSync(`lsof -i:${port} -t`, { encoding: 'utf8' }).trim().split('\n');
    for (const pid of pids) {
      if (pid) {
        try { execSync(`kill -9 ${pid}`, { stdio: 'ignore' }); } catch {}
      }
    }
  } catch {}
}

export async function launchChrome(options: ChromeLaunchOptions = {}): Promise<{ port: number; process: ChildProcess; wsUrl: string }> {
  const port = options.port || 18892;
  const userDataDir = options.userDataDir || path.join(os.tmpdir(), 'free-ai-gateway-chrome');

  // Kill existing Chrome on port
  if (isPortInUse(port)) {
    killChromeOnPort(port);
    await new Promise(r => setTimeout(r, 1000));
  }

  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error('Chrome/Chromium not found. Please install Google Chrome.');
  }

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    '--disable-default-apps',
  ];

  if (options.headless) {
    args.push('--headless=new');
  }

  const proc = spawn(chromePath, args, {
    detached: false,
    stdio: 'ignore',
  });

  // Wait for Chrome to start
  let wsUrl: string | null = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const data = await response.json() as any;
        wsUrl = data.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    proc.kill();
    throw new Error('Failed to start Chrome debugger');
  }

  return { port, process: proc, wsUrl };
}

export async function getWebSocketUrl(port: number): Promise<string | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (response.ok) {
      const data = await response.json() as any;
      return data.webSocketDebuggerUrl;
    }
  } catch {}
  return null;
}
