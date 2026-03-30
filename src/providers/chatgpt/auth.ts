import { autoLogin } from '../../browser/auto-login';
import type { ProviderCredentials, AuthField } from '../../gateway/types';

export const PROVIDER_URL = 'https://chatgpt.com';

export const AUTH_FIELDS: AuthField[] = [
  {
    name: 'cookie',
    label: 'Cookie (auto-captured)',
    type: 'cookie',
    required: true,
    description: 'Automatically captured after browser login on chatgpt.com',
  },
  {
    name: 'accessToken',
    label: 'Access Token (auto-captured)',
    type: 'bearer',
    required: false,
    description: 'Automatically extracted from the session token cookie',
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
 * Start automatic ChatGPT login.
 * Opens Chrome, navigates to chatgpt.com, waits for user to log in,
 * then auto-captures cookies and extracts the access token.
 */
export async function startAutoLogin(
  onProgress?: (msg: string) => void
): Promise<ProviderCredentials> {
  return autoLogin({
    providerId: 'chatgpt',
    loginUrl: PROVIDER_URL,
    detectLogin: async (cookies) => {
      return cookies.some(
        (c: { name: string; value: string }) => c.name === '__Secure-next-auth.session-token' && c.value.length > 20
      );
    },
    captureExtra: async (_page, context) => {
      const cookies = await context.cookies(['chatgpt.com', 'chat.openai.com']);
      const sessionToken = cookies.find((c: { name: string; value: string }) => c.name === '__Secure-next-auth.session-token');
      return {
        accessToken: sessionToken?.value || '',
      };
    },
    onProgress,
  });
}

/**
 * Validate credentials - lenient check.
 */
export async function validateCredentials(credentials: ProviderCredentials): Promise<boolean> {
  const cookie = credentials.cookie || '';
  return cookie.length > 20;
}
