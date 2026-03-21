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
  messagesToPrompt,
  DEFAULT_USER_AGENT,
} from '../common';
import { v4 as uuidv4 } from 'uuid';

const BASE_URL = 'https://chat.deepseek.com';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeepSeekPowChallenge {
  algorithm: string;
  challenge: string;
  difficulty: number;
  salt: string;
  signature: string;
  expire_at?: number;
}

interface DeepSeekPowResponse {
  data?: {
    biz_data?: { challenge?: DeepSeekPowChallenge };
    challenge?: DeepSeekPowChallenge;
  };
  challenge?: DeepSeekPowChallenge;
}

interface DeepSeekChatSessionResponse {
  data?: {
    biz_data?: {
      biz_id?: string;
      chat_session_id?: string;
      id?: string;
      title?: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHeaders(credentials: ProviderCredentials): Record<string, string> {
  return {
    Cookie: credentials.cookie,
    'User-Agent': (credentials.userAgent as string) || DEFAULT_USER_AGENT,
    'Content-Type': 'application/json',
    Accept: '*/*',
    Referer: `${BASE_URL}/`,
    Origin: BASE_URL,
    'x-client-platform': 'web',
    'x-client-version': '1.7.0',
    'x-app-version': '20241129.1',
    ...(credentials.bearer ? { Authorization: `Bearer ${credentials.bearer}` } : {}),
  };
}

// ---------------------------------------------------------------------------
// PoW (Proof-of-Work)
// ---------------------------------------------------------------------------

async function createPowChallenge(
  headers: Record<string, string>,
  targetPath: string,
  signal?: AbortSignal
): Promise<DeepSeekPowChallenge> {
  const res = await fetch(`${BASE_URL}/api/v0/chat/create_pow_challenge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ target_path: targetPath }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create PoW challenge: ${res.status} ${text}`);
  }

  const data = (await res.json()) as DeepSeekPowResponse;
  const challenge =
    data.data?.biz_data?.challenge || data.data?.challenge || data.challenge;
  if (!challenge) {
    throw new Error('PoW challenge missing in response');
  }
  return challenge;
}

/**
 * Solve PoW challenge using SHA-256 brute-force.
 * DeepSeekHashV1 (WASM) is not yet implemented — falls back to sha256 only.
 */
async function solvePow(challenge: DeepSeekPowChallenge): Promise<number> {
  const { algorithm, challenge: target, salt, difficulty } = challenge;

  if (algorithm === 'sha256') {
    let nonce = 0;
    const targetDifficulty =
      difficulty > 1000 ? Math.floor(Math.log2(difficulty)) : difficulty;

    while (nonce <= 1_000_000) {
      const input = salt + target + nonce;
      const hash = crypto.createHash('sha256').update(input).digest('hex');

      let zeroBits = 0;
      for (const char of hash) {
        const val = parseInt(char, 16);
        if (val === 0) {
          zeroBits += 4;
        } else {
          zeroBits += Math.clz32(val) - 28;
          break;
        }
      }

      if (zeroBits >= targetDifficulty) {
        return nonce;
      }
      nonce++;
    }
    throw new Error('SHA-256 PoW timeout (exceeded 1M iterations)');
  }

  // For DeepSeekHashV1 we'd need WASM — return 0 as a best-effort placeholder
  if (algorithm === 'DeepSeekHashV1') {
    console.warn(
      '[DeepSeekWebClient] DeepSeekHashV1 PoW algorithm requires WASM; returning dummy answer'
    );
    return 0;
  }

  throw new Error(`Unsupported PoW algorithm: ${algorithm}`);
}

/**
 * Build the x-ds-pow-response header value.
 */
async function buildPowHeader(
  headers: Record<string, string>,
  targetPath: string,
  signal?: AbortSignal
): Promise<Record<string, string>> {
  const challenge = await createPowChallenge(headers, targetPath, signal);
  const answer = await solvePow(challenge);
  const powResponse = Buffer.from(
    JSON.stringify({ ...challenge, answer, target_path: targetPath })
  ).toString('base64');
  return { 'x-ds-pow-response': powResponse };
}

// ---------------------------------------------------------------------------
// Chat session
// ---------------------------------------------------------------------------

async function createChatSession(
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/v0/chat_session/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create chat session: ${res.status} ${text}`);
  }

  const data = (await res.json()) as DeepSeekChatSessionResponse;
  const sessionId =
    data.data?.biz_data?.id || data.data?.biz_data?.chat_session_id || '';
  return sessionId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a non-streaming chat completion request to DeepSeek.
 *
 * DeepSeek's API is inherently streaming (SSE). For the non-streaming path
 * we collect the full stream in-memory and return a single aggregated response.
 */
export async function deepseekChat(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, messages, signal } = params;
  const headers = buildHeaders(credentials);

  // 1. Create a fresh chat session
  const sessionId = await createChatSession(headers, signal);

  // 2. Build prompt from messages
  const prompt = messagesToPrompt(messages);

  // 3. PoW
  const targetPath = '/api/v0/chat/completion';
  const powHeaders = await buildPowHeader(headers, targetPath, signal);

  // 4. Send completion request (stream:true is the only mode DeepSeek exposes)
  const thinkingEnabled = model === 'deepseek-reasoner';

  const res = await fetch(`${BASE_URL}${targetPath}`, {
    method: 'POST',
    headers: { ...headers, ...powHeaders },
    body: JSON.stringify({
      chat_session_id: sessionId,
      parent_message_id: null,
      prompt,
      ref_file_ids: [],
      search_enabled: false,
      thinking_enabled: thinkingEnabled,
      model,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek API error ${res.status}: ${text}`);
  }

  // 5. Collect streaming chunks into a single response
  let content = '';
  let reasoningContent = '';

  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data);
      const choice = parsed.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta ?? choice.message ?? {};
      if (delta.reasoning_content) {
        reasoningContent += delta.reasoning_content;
      }
      if (delta.content) {
        content += delta.content;
      }
    } catch {
      // skip malformed lines
    }
  }

  return createResponse(model, content, reasoningContent || undefined);
}

/**
 * Send a streaming chat completion request to DeepSeek.
 * Parses the SSE stream and invokes the callback for each chunk.
 */
export async function deepseekChatStream(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const { model, messages, signal } = params;
  const headers = buildHeaders(credentials);

  // 1. Create a fresh chat session
  const sessionId = await createChatSession(headers, signal);

  // 2. Build prompt
  const prompt = messagesToPrompt(messages);

  // 3. PoW
  const targetPath = '/api/v0/chat/completion';
  const powHeaders = await buildPowHeader(headers, targetPath, signal);

  // 4. Send completion request
  const thinkingEnabled = model === 'deepseek-reasoner';

  const res = await fetch(`${BASE_URL}${targetPath}`, {
    method: 'POST',
    headers: { ...headers, ...powHeaders },
    body: JSON.stringify({
      chat_session_id: sessionId,
      parent_message_id: null,
      prompt,
      ref_file_ids: [],
      search_enabled: false,
      thinking_enabled: thinkingEnabled,
      model,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek API error ${res.status}: ${text}`);
  }

  // 5. Stream chunks to caller
  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data);
      const choice = parsed.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta ?? choice.message ?? {};

      // Reasoning content (deepseek-reasoner)
      if (delta.reasoning_content) {
        sendChunk(callback, model, id, created, {
          role: 'assistant',
          content: '',
          ...(delta.reasoning_content
            ? { reasoning_content: delta.reasoning_content }
            : {}),
        } as any);
      }

      // Regular content
      if (delta.content) {
        sendChunk(callback, model, id, created, {
          role: 'assistant',
          content: delta.content,
        });
      }

      // Finish
      if (choice.finish_reason) {
        sendChunk(callback, model, id, created, {}, choice.finish_reason);
      }
    } catch {
      // skip malformed JSON lines
    }
  }
}
