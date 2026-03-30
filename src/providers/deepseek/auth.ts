import { autoLogin } from '../../browser/auto-login';
import type { ProviderCredentials, AuthField } from '../../gateway/types';

export const PROVIDER_URL = 'https://chat.deepseek.com';

export const AUTH_FIELDS: AuthField[] = [
  {
    name: 'cookie',
    label: 'Cookie (auto-captured)',
    type: 'cookie',
    required: true,
    description: 'Automatically captured after browser login on chat.deepseek.com',
  },
  {
    name: 'bearer',
    label: 'Bearer Token (auto-captured)',
    type: 'bearer',
    required: false,
    description: 'Automatically captured from DeepSeek API requests',
  },
  {
    name: 'userAgent',
    label: 'User Agent (auto-captured)',
    type: 'text',
    required: false,
    description: 'Automatically captured from the browser session',
  },
];

/**
 * Start automatic DeepSeek login.
 * Opens Chrome, navigates to chat.deepseek.com, waits for user to log in,
 * then auto-captures cookies and bearer token.
 */
export async function startAutoLogin(
  onProgress?: (msg: string) => void
): Promise<ProviderCredentials> {
  return autoLogin({
    providerId: 'deepseek',
    loginUrl: PROVIDER_URL,
    detectLogin: async (cookies) => {
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      return (
        cookieStr.includes('d_id=') ||
        cookieStr.includes('ds_session_id=') ||
        cookieStr.includes('HWSID=') ||
        cookies.length > 3
      );
    },
    captureBearer: async (page, cookies) => {
      try {
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        const res = await page.request.get(`${PROVIDER_URL}/api/v0/users/current`, {
          headers: { Cookie: cookieStr },
        });
        if (res.ok()) {
          const data = (await res.json()) as any;
          return data?.data?.biz_data?.token || '';
        }
      } catch {
        // bearer capture is optional
      }
      return '';
    },
    onProgress,
  });
}

/**
 * Validate credentials - lenient check.
 * For free web providers, we just check if cookies exist.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  const cookie = credentials.cookie || '';
  // Just check if we have meaningful cookies
  return cookie.length > 20;
}
