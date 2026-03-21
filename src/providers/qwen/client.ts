import type {
  ProviderCredentials,
  ChatParams,
  ChatCompletionResponse,
  StreamCallback,
  ChatCompletionChunk,
} from '../../gateway/types';
import {
  createResponse,
  sendChunk,
  parseSSEStream,
  DEFAULT_USER_AGENT,
} from '../common';
import { v4 as uuidv4 } from 'uuid';

const API_URL = 'https://chat.qwen.ai/api/chat/completions';

/**
 * Send a non-streaming chat request to Qwen International.
 * NOTE: Qwen's web API is SSE-only, so we collect all stream chunks
 * and return a single aggregated response.
 */
export async function chatQwen(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, messages, temperature, maxTokens, signal } = params;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': credentials.cookie,
      'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
      'Referer': 'https://chat.qwen.ai/',
      'Origin': 'https://chat.qwen.ai',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qwen API error ${res.status}: ${text}`);
  }

  // Qwen may return SSE even when stream=false; collect all content
  let content = '';
  let reasoningContent = '';
  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  try {
    for await (const data of parseSSEStream(res)) {
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (delta?.content) content += delta.content;
        if ((delta as any)?.reasoning_content) {
          reasoningContent += (delta as any).reasoning_content;
        }
      } catch {
        // Skip malformed JSON chunks
      }
    }
  } catch {
    // If streaming fails, try parsing as JSON
    const text = await res.text().catch(() => '');
    if (text) {
      try {
        const json = JSON.parse(text);
        content = json.choices?.[0]?.message?.content || text;
      } catch {
        content = text;
      }
    }
  }

  return createResponse(model, content, reasoningContent || undefined);
}

/**
 * Send a streaming chat request to Qwen International.
 * Parses the SSE response and calls the callback for each chunk.
 */
export async function chatStreamQwen(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const { model, messages, temperature, maxTokens, signal } = params;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': credentials.cookie,
      'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
      'Referer': 'https://chat.qwen.ai/',
      'Origin': 'https://chat.qwen.ai',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qwen API error ${res.status}: ${text}`);
  }

  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data) as ChatCompletionChunk;
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;

      // Pass through reasoning_content if present
      const chunkDelta: Record<string, unknown> = {};
      if (delta.role) chunkDelta.role = delta.role;
      if (delta.content) chunkDelta.content = delta.content;
      if ((delta as any).reasoning_content) {
        chunkDelta.reasoning_content = (delta as any).reasoning_content;
      }

      sendChunk(
        callback,
        model,
        id,
        created,
        chunkDelta as any,
        parsed.choices?.[0]?.finish_reason ?? null
      );
    } catch {
      // Skip malformed JSON chunks
    }
  }

  // Send final done chunk
  sendChunk(callback, model, id, created, {}, 'stop');
}
