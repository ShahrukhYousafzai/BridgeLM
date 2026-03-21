import type {
  ProviderCredentials,
  ChatParams,
  ChatCompletionResponse,
  ChatCompletionChunk,
  StreamCallback,
} from '../../gateway/types';
import {
  createResponse,
  sendChunk,
  parseSSEStream,
  DEFAULT_USER_AGENT,
} from '../common';
import { v4 as uuidv4 } from 'uuid';

const API_URL = 'https://www.doubao.com/api/chat/completions';

/**
 * Send a non-streaming chat completion request to Doubao.
 */
export async function doubaoChat(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, messages, temperature, maxTokens, signal } = params;

  const body: Record<string, unknown> = {
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    stream: false,
  };
  if (temperature !== undefined) body['temperature'] = temperature;
  if (maxTokens !== undefined) body['max_tokens'] = maxTokens;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': credentials.cookie,
      'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
      'Origin': 'https://www.doubao.com',
      'Referer': 'https://www.doubao.com/chat/',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Doubao API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as any;

  // Adapt Doubao response to OpenAI-compatible format
  if (data['id'] && data['choices']) {
    return data as ChatCompletionResponse;
  }

  // If the response format differs, extract content and wrap it
  const content = data['choices']?.[0]?.message?.content
    ?? data['content']
    ?? data['message']
    ?? JSON.stringify(data);

  return createResponse(model, typeof content === 'string' ? content : JSON.stringify(content));
}

/**
 * Send a streaming chat completion request to Doubao.
 * Parses the SSE stream and invokes the callback for each chunk.
 */
export async function doubaoChatStream(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const { model, messages, temperature, maxTokens, signal } = params;

  const body: Record<string, unknown> = {
    model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    stream: true,
  };
  if (temperature !== undefined) body['temperature'] = temperature;
  if (maxTokens !== undefined) body['max_tokens'] = maxTokens;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': credentials.cookie,
      'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
      'Origin': 'https://www.doubao.com',
      'Referer': 'https://www.doubao.com/chat/',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Doubao API error ${res.status}: ${text}`);
  }

  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data);
      const choice = parsed.choices?.[0];

      if (!choice) continue;

      const delta = choice.delta ?? choice.message ?? {};

      // Check for reasoning content (Doubao Seed models support chain-of-thought)
      const reasoningContent = delta.reasoning_content;
      const content = delta.content;

      if (reasoningContent) {
        sendChunk(callback, model, id, created, {
          role: 'assistant',
          content: '',
          ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
        } as any);
      }

      if (content) {
        sendChunk(callback, model, id, created, {
          role: 'assistant',
          content,
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
