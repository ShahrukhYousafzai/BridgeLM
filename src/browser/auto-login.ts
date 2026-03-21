import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { launchChrome } from './chrome.js';
import type { ProviderCredentials } from '../gateway/types';

export interface AutoLoginOptions {
  providerId: string;
  loginUrl: string;
  detectLogin?: (cookies: Array<{ name: string; value: string }>, page: Page, url: string) => Promise<boolean>;
  captureBearer?: (page: Page, cookies: Array<{ name: string; value: string }>) => Promise<string>;
  captureExtra?: (page: Page, context: BrowserContext) => Promise<Record<string, string>>;
  onProgress?: (message: string) => void;
}

let sharedBrowser: { browser: Browser; port: number } | null = null;
let loginProcesses: Map<string, Promise<ProviderCredentials>> = new Map();

async function getOrCreateBrowser(onProgress?: (msg: string) => void): Promise<{ browser: Browser; port: number }> {
  if (sharedBrowser) {
    try {
      const testCtx = await sharedBrowser.browser.newContext();
      await testCtx.close();
      return sharedBrowser;
    } catch {
      console.log('[AutoLogin] Previous browser closed, re-launching...');
      sharedBrowser = null;
    }
  }

  onProgress?.('Launching Chrome...');
  const { port, wsUrl } = await launchChrome({ port: 18892 });
  const browser = await chromium.connectOverCDP(wsUrl);
  sharedBrowser = { browser, port };
  return sharedBrowser;
}

/**
 * Universal login detection: checks if user is logged in by looking for
 * significant cookies or URL changes indicating a successful session.
 */
async function universalDetectLogin(
  cookies: Array<{ name: string; value: string }>,
  page: Page,
  loginUrl: string
): Promise<boolean> {
  const currentUrl = page.url();

  // If URL has moved away from the login page, user likely logged in
  const loginHost = new URL(loginUrl).hostname;
  const currentHost = new URL(currentUrl).hostname;

  // Check if we have meaningful session cookies (not just tracking cookies)
  const sessionCookieNames = [
    'sessionKey', 'session-token', '__Secure-1PSID', '__Secure-next-auth.session-token',
    'd_id', 'ds_session_id', 'HWSID', 'auth_token', 'ct0', 'SID',
    'token', 'access_token', 'jwt', 'sid', 'connect.sid',
    'HWWAFSESTIME', 'HWWAFSESID', 'HMACCOUNT', 'SSPRSID',
    'bos_sess', 'passport_login_username', 'security_session_key',
  ];

  const hasSessionCookie = cookies.some(c =>
    sessionCookieNames.some(name => c.name.toLowerCase().includes(name.toLowerCase())) ||
    c.value.length > 100 // Large cookie values are usually session tokens
  );

  // If we have session cookies, we're logged in
  if (hasSessionCookie && cookies.length >= 3) {
    return true;
  }

  // If cookies count is significant (>5), likely logged in
  if (cookies.length >= 6) {
    return true;
  }

  return false;
}

export async function autoLogin(options: AutoLoginOptions): Promise<ProviderCredentials> {
  const {
    providerId,
    loginUrl,
    detectLogin,
    captureBearer,
    captureExtra,
    onProgress,
  } = options;

  const existing = loginProcesses.get(providerId);
  if (existing) return existing;

  const loginPromise = (async () => {
    const { browser } = await getOrCreateBrowser(onProgress);
    const context = browser.contexts()[0] || await browser.newContext();
    const page = await context.newPage();

    try {
      onProgress?.(`Opening ${loginUrl}...`);
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const userAgent = await page.evaluate(() => navigator.userAgent);

      onProgress?.('Please login in the browser. We will auto-capture your session...');

      let capturedBearer = '';
      const capturedExtra: Record<string, string> = {};

      // Intercept network requests for bearer tokens
      page.on('request', (request) => {
        try {
          const headers = request.headers();
          const auth = headers['authorization'];
          if (auth?.startsWith('Bearer ') && !capturedBearer) {
            capturedBearer = auth.slice(7);
          }
        } catch {}
      });

      // Wait for login detection
      const credentials = await new Promise<ProviderCredentials>((resolve, reject) => {
        let resolved = false;
        const timeoutId = setTimeout(() => {
          if (!resolved) {
            reject(new Error('Login timed out (5 min). Please try again.'));
          }
        }, 300000);

        const tryResolve = async () => {
          if (resolved) return;

          try {
            // Get ALL cookies from ALL domains (not filtered)
            const allCookies = await context.cookies();
            const currentUrl = page.url();

            // Use custom detector or universal detector
            const isLoggedIn = detectLogin
              ? await detectLogin(allCookies, page, currentUrl)
              : await universalDetectLogin(allCookies, page, loginUrl);

            if (isLoggedIn) {
              if (!capturedBearer && captureBearer) {
                try { capturedBearer = await captureBearer(page, allCookies); } catch {}
              }
              if (captureExtra) {
                try { Object.assign(capturedExtra, await captureExtra(page, context)); } catch {}
              }

              resolved = true;
              clearTimeout(timeoutId);
              clearInterval(checkInterval);

              const cookieString = allCookies.map(c => `${c.name}=${c.value}`).join('; ');
              onProgress?.('Session captured successfully!');

              resolve({
                cookie: cookieString,
                bearer: capturedBearer,
                userAgent,
                ...capturedExtra,
              });
            }
          } catch {}
        };

        // Check every 3 seconds
        const checkInterval = setInterval(() => { tryResolve(); }, 3000);

        // Also check on navigation / responses
        page.on('response', () => { tryResolve(); });
        page.on('close', () => {
          clearInterval(checkInterval);
          if (!resolved) {
            clearTimeout(timeoutId);
            reject(new Error('Browser closed before login was detected'));
          }
        });
      });

      // Close the tab only
      await page.close().catch(() => {});
      return credentials;
    } catch (err) {
      await page.close().catch(() => {});
      throw err;
    } finally {
      loginProcesses.delete(providerId);
    }
  })();

  loginProcesses.set(providerId, loginPromise);
  return loginPromise;
}

export async function closeSharedBrowser(): Promise<void> {
  if (sharedBrowser) {
    try { await sharedBrowser.browser.close(); } catch {}
    sharedBrowser = null;
  }
}
