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

// Updated endpoint to match openclaw-zero-token implementation
const API_URL = 'https://chatglm.cn/chatglm/backend-api/assistant/stream';
const SIGN_SECRET = '8a1317a7468aa3ad86e997d08f3f31cb';

/**
 * Generate X-Sign, X-Nonce, X-Timestamp headers required by chatglm.cn
 */
function generateSign(): { timestamp: string; nonce: string; sign: string } {
  const e = Date.now();
  const A = e.toString();
  const t = A.length;
  const o = A.split('').map((c) => Number(c));
  const i = o.reduce((acc, v) => acc + v, 0) - o[t - 2];
  const a = i % 10;
  const timestamp = A.substring(0, t - 2) + a + A.substring(t - 1, t);
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const sign = crypto
    .createHash('md5')
    .update(`${timestamp}-${nonce}-${SIGN_SECRET}`)
    .digest('hex');
  return { timestamp, nonce, sign };
}

/**
 * Extract chatglm_token from cookies.
 */
function extractAccessToken(cookie: string): string | null {
  const match = cookie.match(/chatglm_token=([^;]+)/);
  return match ? match[1] : null;
}

/**
 * Build request headers for GLM API calls using the correct format.
 */
function buildHeaders(credentials: ProviderCredentials, deviceId: string): Record<string, string> {
  const sign = generateSign();
  const requestId = uuidv4();
  const accessToken = extractAccessToken(credentials.cookie || '');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
    'App-Name': 'chatglm',
    'Origin': 'https://chatglm.cn',
    'Referer': 'https://chatglm.cn/',
    'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
    'X-App-Platform': 'pc',
    'X-App-Version': '0.0.1',
    'X-App-fr': 'default',
    'X-Device-Brand': '',
    'X-Device-Id': deviceId,
    'X-Device-Model': '',
    'X-Exp-Groups': 'mainchat_server_app:exp:A,mainchat_rm_fc:exp:add',
    'X-Lang': 'zh',
    'X-Nonce': sign.nonce,
    'X-Request-Id': requestId,
    'X-Sign': sign.sign,
    'X-Timestamp': sign.timestamp,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  } else if (credentials.bearer) {
    headers['Authorization'] = `Bearer ${credentials.bearer}`;
  }

  return headers;
}

/**
 * Send a non-streaming chat request to GLM (智谱清言).
 */
export async function chatGlm(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, messages, temperature, maxTokens, signal } = params;
  const deviceId = crypto.randomUUID().replace(/-/g, '');

  const body: Record<string, unknown> = {
    assistant_id: model,
    chat_mode: 'zero',
    chat_session_id: '',
    continue: false,
    clip_release: false,
    streaming: false,
    support_plugin: false,
    user_position_info: null,
    meta_data: {
      channel: '',
      draft_id: '',
      input_question_type: 'xxxx',
      is_networking: false,
      is_test: false,
      quote_log_id: '',
      platform: 'pc',
      cogview: { rm_label_watermark: false },
    },
    messages: messages.map(m => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }],
    })),
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: buildHeaders(credentials, deviceId),
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
 */
export async function chatStreamGlm(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const { model, messages, temperature, maxTokens, signal } = params;
  const deviceId = crypto.randomUUID().replace(/-/g, '');

  const body: Record<string, unknown> = {
    assistant_id: model,
    chat_mode: 'zero',
    chat_session_id: '',
    continue: false,
    clip_release: false,
    streaming: true,
    support_plugin: false,
    user_position_info: null,
    meta_data: {
      channel: '',
      draft_id: '',
      input_question_type: 'xxxx',
      is_networking: false,
      is_test: false,
      quote_log_id: '',
      platform: 'pc',
      cogview: { rm_label_watermark: false },
    },
    messages: messages.map(m => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }],
    })),
  };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: buildHeaders(credentials, deviceId),
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
        sendChunk(callback, model, id, created, delta as any, finishReason);
      }
    } catch {
      // Skip malformed JSON chunks
    }
  }

  sendChunk(callback, model, id, created, {}, 'stop');
}
