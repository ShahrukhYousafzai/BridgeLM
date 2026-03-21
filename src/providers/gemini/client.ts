import crypto from 'node:crypto';
import type {
  ProviderCredentials,
  ChatParams,
  ChatCompletionResponse,
  StreamCallback,
} from '../../gateway/types';
import {
  createResponse,
  sendChunk,
  DEFAULT_USER_AGENT,
} from '../common';
import { v4 as uuidv4 } from 'uuid';

// Gemini internal API endpoints
const GENERATE_URL = 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate';
const CONVERSE_URL = 'https://gemini.google.com/app';

/**
 * Extract the __Secure-1PSID value from the cookie string.
 */
function extractPSID(credentials: ProviderCredentials): string {
  const match = credentials.cookie.match(/__Secure-1PSID=([^;]+)/);
  if (!match) {
    throw new Error('Missing __Secure-1PSID in cookie string');
  }
  return match[1];
}

/**
 * Build the common headers for Gemini API requests.
 */
function buildHeaders(credentials: ProviderCredentials): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'Cookie': credentials.cookie,
    'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
    'Origin': 'https://gemini.google.com',
    'Referer': 'https://gemini.google.com/app',
    'X-Same-Domain': '1',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
}

/**
 * Convert ChatParams messages into a single prompt string for Gemini.
 */
function messagesToPrompt(params: ChatParams): string {
  return params.messages.map(msg => {
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return `[${role}]: ${content}`;
  }).join('\n\n');
}

/**
 * Generate a Gemini SNlM0e token required for API calls.
 * This is extracted from the Gemini app page.
 */
async function fetchSNlM0e(credentials: ProviderCredentials): Promise<string> {
  const res = await fetch(CONVERSE_URL, {
    method: 'GET',
    headers: {
      'Cookie': credentials.cookie,
      'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Gemini page: ${res.status}`);
  }

  const html = await res.text();

  // Extract SNlM0e from the page HTML
  const match = html.match(/SNlM0e":"([^"]+)"/);
  if (!match) {
    throw new Error('Failed to extract SNlM0e token from Gemini page');
  }

  return match[1];
}

/**
 * Send a non-streaming chat completion request to Gemini Web.
 * Uses the internal Bard/Gemini API with SNlM0e authentication.
 */
export async function geminiChat(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, signal } = params;

  const snlm0e = await fetchSNlM0e(credentials);
  const prompt = messagesToPrompt(params);

  // Gemini internal API uses form-encoded data
  const formData = new URLSearchParams();
  formData.append('f.req', JSON.stringify([null, JSON.stringify([[prompt], [], []])]));
  formData.append('at', snlm0e);

  const res = await fetch(GENERATE_URL, {
    method: 'POST',
    headers: buildHeaders(credentials),
    body: formData.toString(),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const text = await res.text();

  // Parse the Gemini response format
  // Response is wrapped in )]}'\n prefix followed by JSON
  let content = '';
  try {
    const cleanText = text.replace(/^\)\]\}'\n/, '');
    const parsed = JSON.parse(cleanText);
    // Navigate the nested Gemini response structure
    const responses = parsed?.[0]?.[2];
    if (responses) {
      const parsedInner = JSON.parse(responses);
      // Extract text from response candidates
      const candidates = parsedInner?.[4]?.[0]?.[1]?.[0];
      if (candidates && typeof candidates === 'string') {
        content = candidates;
      }
    }
  } catch {
    // If parsing fails, try to extract text from the raw response
    content = text.slice(0, 4096);
  }

  if (!content) {
    content = 'No response received from Gemini.';
  }

  return createResponse(model, content);
}

/**
 * Send a streaming chat completion request to Gemini Web.
 * Parses the SSE stream and invokes the callback for each chunk.
 */
export async function geminiChatStream(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const { model, signal } = params;

  const snlm0e = await fetchSNlM0e(credentials);
  const prompt = messagesToPrompt(params);

  // Gemini internal API uses form-encoded data
  const formData = new URLSearchParams();
  formData.append('f.req', JSON.stringify([null, JSON.stringify([[prompt], [], []])]));
  formData.append('at', snlm0e);

  const res = await fetch(GENERATE_URL, {
    method: 'POST',
    headers: buildHeaders(credentials),
    body: formData.toString(),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  // Gemini returns chunked responses (not standard SSE)
  // Parse the response body as a stream of text
  if (!res.body) {
    throw new Error('No response body from Gemini API');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastSent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Try to parse accumulated data
    // Gemini sends chunks prefixed with )]}'\n
    const cleanBuffer = buffer.replace(/^\)\]\}'\n/, '');

    try {
      // Gemini sends multi-line JSON responses
      const lines = cleanBuffer.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const innerData = parsed?.[0]?.[2];
          if (innerData) {
            const inner = JSON.parse(innerData);
            const text = inner?.[4]?.[0]?.[1]?.[0];
            if (text && typeof text === 'string' && text.length > lastSent.length) {
              const delta = text.slice(lastSent.length);
              lastSent = text;
              if (delta) {
                sendChunk(callback, model, id, created, {
                  role: 'assistant',
                  content: delta,
                });
              }
            }
          }
        } catch {
          // Line not parseable yet, continue accumulating
        }
      }
    } catch {
      // Buffer not ready yet
    }
  }

  // Final flush - try to parse remaining buffer
  const cleanRemaining = buffer.replace(/^\)\]\}'\n/, '');
  try {
    const lines = cleanRemaining.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const innerData = parsed?.[0]?.[2];
        if (innerData) {
          const inner = JSON.parse(innerData);
          const text = inner?.[4]?.[0]?.[1]?.[0];
          if (text && typeof text === 'string' && text.length > lastSent.length) {
            const delta = text.slice(lastSent.length);
            if (delta) {
              sendChunk(callback, model, id, created, {
                role: 'assistant',
                content: delta,
              });
            }
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }
  } catch {
    // Final parse failed
  }

  // Send finish chunk
  sendChunk(callback, model, id, created, {}, 'stop');
}
