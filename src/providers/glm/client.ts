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

const API_URL = 'https://chatglm.cn/chatglm/assistant_api/chat';

/**
 * Build request headers for GLM API calls.
 * GLM uses both cookie and optional bearer token auth.
 */
function buildHeaders(credentials: ProviderCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cookie': credentials.cookie,
    'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
    'Referer': 'https://chatglm.cn/',
    'Origin': 'https://chatglm.cn',
  };
  if (credentials.bearer) {
    headers['Authorization'] = `Bearer ${credentials.bearer}`;
  }
  return headers;
}

/**
 * Send a non-streaming chat request to GLM (智谱清言).
 * Collects all SSE chunks and returns an aggregated response.
 */
export async function chatGlm(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, messages, temperature, maxTokens, signal } = params;

  const body: Record<string, unknown> = {
    assistant_id: model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    stream: false,
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: buildHeaders(credentials),
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GLM API error ${res.status}: ${text}`);
  }

  let content = '';
  let reasoningContent = '';
  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  try {
    for await (const data of parseSSEStream(res)) {
      try {
        const parsed = JSON.parse(data);
        // GLM uses different response shapes; handle common ones
        const text = parsed.parts?.[0]?.content
          || parsed.choices?.[0]?.delta?.content
          || parsed.content
          || '';
        const reasoning = (parsed as any).reasoning_content
          || parsed.choices?.[0]?.delta?.reasoning_content
          || '';
        if (text) content += text;
        if (reasoning) reasoningContent += reasoning;
      } catch {
        // Skip malformed JSON chunks
      }
    }
  } catch {
    const text = await res.text().catch(() => '');
    if (text) {
      try {
        const json = JSON.parse(text);
        content = json.parts?.[0]?.content
          || json.choices?.[0]?.message?.content
          || json.content
          || text;
      } catch {
        content = text;
      }
    }
  }

  return createResponse(model, content, reasoningContent || undefined);
}

/**
 * Send a streaming chat request to GLM (智谱清言).
 * Parses the SSE response and calls the callback for each chunk.
 */
export async function chatStreamGlm(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const { model, messages, temperature, maxTokens, signal } = params;

  const body: Record<string, unknown> = {
    assistant_id: model,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    stream: true,
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: buildHeaders(credentials),
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GLM API error ${res.status}: ${text}`);
  }

  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data);

      // GLM uses different response shapes; handle common ones
      const textContent = parsed.parts?.[0]?.content
        || parsed.choices?.[0]?.delta?.content
        || parsed.content
        || null;
      const reasoningContent = (parsed as any).reasoning_content
        || parsed.choices?.[0]?.delta?.reasoning_content
        || null;
      const finishReason = parsed.choices?.[0]?.finish_reason
        || (parsed.done ? 'stop' : null);

      const delta: Record<string, unknown> = {};
      if (textContent) delta.content = textContent;
      if (reasoningContent) delta.reasoning_content = reasoningContent;

      if (Object.keys(delta).length > 0 || finishReason) {
        sendChunk(
          callback,
          model,
          id,
          created,
          delta as any,
          finishReason
        );
      }
    } catch {
      // Skip malformed JSON chunks
    }
  }

  sendChunk(callback, model, id, created, {}, 'stop');
}
