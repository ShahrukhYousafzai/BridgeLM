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
  parseSSEStream,
  DEFAULT_USER_AGENT,
} from '../common';
import { v4 as uuidv4 } from 'uuid';

const CONVERSATION_URL = 'https://chatgpt.com/backend-api/conversation';
const INIT_URL = 'https://chatgpt.com/backend-api/conversation/init';
const SENTINEL_PREPARE_URL = 'https://chatgpt.com/backend-api/sentinel/chat-requirements/prepare';
const SENTINEL_FINALIZE_URL = 'https://chatgpt.com/backend-api/sentinel/chat-requirements/finalize';

/**
 * Build the common headers for ChatGPT API requests.
 */
function buildHeaders(credentials: ProviderCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'Cookie': credentials.cookie,
    'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
    'oai-device-id': crypto.randomUUID(),
    'oai-language': 'en-US',
    'Origin': 'https://chatgpt.com',
    'Referer': 'https://chatgpt.com/',
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
  };

  if (credentials.accessToken) {
    headers['Authorization'] = `Bearer ${credentials.accessToken}`;
  }

  return headers;
}

/**
 * Warm up the ChatGPT sentinel system (best-effort).
 */
async function warmupSentinel(credentials: ProviderCredentials): Promise<void> {
  const headers = buildHeaders(credentials);
  try {
    await fetch(INIT_URL, {
      method: 'POST',
      headers,
      body: '{}',
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* ignore */ }
  try {
    await fetch(SENTINEL_PREPARE_URL, {
      method: 'POST',
      headers,
      body: '{}',
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* ignore */ }
  try {
    await fetch(SENTINEL_FINALIZE_URL, {
      method: 'POST',
      headers,
      body: '{}',
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* ignore */ }
}

/**
 * Build the conversation request body for ChatGPT Web API.
 */
function buildConversationBody(params: ChatParams): Record<string, unknown> {
  const { model, messages, temperature, maxTokens } = params;

  const messageId = crypto.randomUUID();
  const parentId = crypto.randomUUID();

  // Take the last user message as the prompt
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const content = lastUserMessage
    ? (typeof lastUserMessage.content === 'string' ? lastUserMessage.content : JSON.stringify(lastUserMessage.content))
    : '';

  // Build conversation history from previous messages
  const chatMessages = messages.map(m => ({
    id: crypto.randomUUID(),
    author: { role: m.role },
    content: {
      content_type: 'text',
      parts: [typeof m.content === 'string' ? m.content : JSON.stringify(m.content)],
    },
  }));

  const body: Record<string, unknown> = {
    action: 'next',
    messages: chatMessages,
    parent_message_id: parentId,
    model,
    timezone_offset_min: new Date().getTimezoneOffset(),
    history_and_training_disabled: false,
    conversation_mode: { kind: 'primary_assistant', plugin_ids: null },
    force_paragen: false,
    force_paragen_model_slug: '',
    force_rate_limit: false,
    reset_rate_limits: false,
    force_use_sse: true,
  };

  if (temperature !== undefined) body['temperature'] = temperature;
  if (maxTokens !== undefined) body['max_tokens'] = maxTokens;

  return body;
}

/**
 * Send a non-streaming chat completion request to ChatGPT Web.
 */
export async function chatgptChat(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, signal } = params;

  await warmupSentinel(credentials);

  const body = buildConversationBody(params);

  const res = await fetch(CONVERSATION_URL, {
    method: 'POST',
    headers: buildHeaders(credentials),
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error('ChatGPT authentication failed. Please refresh your session.');
    }
    throw new Error(`ChatGPT API error ${res.status}: ${text}`);
  }

  // Parse SSE response and extract content
  const chunks: string[] = [];
  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data);
      const parts = parsed.message?.content?.parts;
      if (parts && Array.isArray(parts)) {
        // For streaming responses, each chunk may contain partial content
        // We accumulate all parts from the final message
        chunks.length = 0; // Keep only latest
        chunks.push(...parts.filter((p: unknown) => typeof p === 'string'));
      }
    } catch {
      // Skip malformed lines
    }
  }

  const content = chunks.join('');
  return createResponse(model, content);
}

/**
 * Send a streaming chat completion request to ChatGPT Web.
 * Parses the SSE stream and invokes the callback for each chunk.
 */
export async function chatgptChatStream(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const { model, signal } = params;

  await warmupSentinel(credentials);

  const body = buildConversationBody(params);

  const res = await fetch(CONVERSATION_URL, {
    method: 'POST',
    headers: buildHeaders(credentials),
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401) {
      throw new Error('ChatGPT authentication failed. Please refresh your session.');
    }
    throw new Error(`ChatGPT API error ${res.status}: ${text}`);
  }

  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);
  let lastContent = '';

  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data);

      // ChatGPT Web sends: { message: { content: { parts: [...] } }, ... }
      const parts = parsed.message?.content?.parts;
      if (parts && Array.isArray(parts)) {
        const fullText = parts.filter((p: unknown) => typeof p === 'string').join('');
        if (fullText.length > lastContent.length) {
          const delta = fullText.slice(lastContent.length);
          lastContent = fullText;
          sendChunk(callback, model, id, created, {
            role: 'assistant',
            content: delta,
          });
        }
      }

      // Check for end of stream
      if (parsed.type === 'message_end' || parsed.done === true) {
        sendChunk(callback, model, id, created, {}, 'stop');
      }
    } catch {
      // Skip malformed JSON lines
    }
  }
}
