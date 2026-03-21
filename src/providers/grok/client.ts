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

const API_URL = 'https://grok.com/rest/app-chat/conversations/new';

/**
 * Send a non-streaming chat completion request to Grok web.
 * Collects the full SSE stream into a single response.
 */
export async function grokChat(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, messages, temperature, maxTokens, signal } = params;

  const body: Record<string, unknown> = {
    message: messages.map(m => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${m.role}: ${content}`;
    }).join('\n\n'),
    model,
  };
  if (temperature !== undefined) body['temperature'] = temperature;
  if (maxTokens !== undefined) body['max_tokens'] = maxTokens;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cookie': credentials.cookie,
    'User-Agent': (credentials.userAgent as string) || DEFAULT_USER_AGENT,
    'Origin': 'https://grok.com',
    'Referer': 'https://grok.com/',
  };
  if (credentials.bearer) {
    headers['Authorization'] = `Bearer ${credentials.bearer}`;
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Grok API error ${res.status}: ${text}`);
  }

  // Collect the streaming response into a single string
  const chunks: string[] = [];
  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data);
      const content = parsed.choices?.[0]?.delta?.content
        ?? parsed.choices?.[0]?.message?.content
        ?? parsed.content
        ?? '';
      if (content) chunks.push(content);
    } catch {
      // Skip malformed JSON lines
    }
  }

  return createResponse(model, chunks.join(''));
}

/**
 * Send a streaming chat completion request to Grok web.
 * Parses the SSE stream and invokes the callback for each chunk.
 */
export async function grokChatStream(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const { model, messages, temperature, maxTokens, signal } = params;

  const body: Record<string, unknown> = {
    message: messages.map(m => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${m.role}: ${content}`;
    }).join('\n\n'),
    model,
  };
  if (temperature !== undefined) body['temperature'] = temperature;
  if (maxTokens !== undefined) body['max_tokens'] = maxTokens;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cookie': credentials.cookie,
    'User-Agent': (credentials.userAgent as string) || DEFAULT_USER_AGENT,
    'Origin': 'https://grok.com',
    'Referer': 'https://grok.com/',
  };
  if (credentials.bearer) {
    headers['Authorization'] = `Bearer ${credentials.bearer}`;
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Grok API error ${res.status}: ${text}`);
  }

  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data);
      const choice = parsed.choices?.[0];

      if (!choice) continue;

      const delta = choice.delta ?? choice.message ?? {};

      if (delta.content) {
        sendChunk(callback, model, id, created, {
          role: 'assistant',
          content: delta.content,
        });
      }

      if (choice.finish_reason) {
        sendChunk(callback, model, id, created, {}, choice.finish_reason);
      }
    } catch {
      // Skip malformed JSON lines
    }
  }
}
