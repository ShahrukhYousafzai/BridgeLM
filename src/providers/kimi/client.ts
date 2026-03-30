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

// Kimi uses Connect protocol (gRPC-web style) - NOT OpenAI-compatible REST API
const API_URL = 'https://www.kimi.com/apiv2/kimi.gateway.chat.v1.ChatService/Chat';

/**
 * Extract auth token from cookie string.
 * Tries multiple cookie names: kimi-auth, access_token, token
 */
function extractAuthCookie(cookie: string): string | null {
  // Try kimi-auth first
  let match = cookie.match(/kimi-auth=([^;]+)/);
  if (match) return match[1];
  
  // Try access_token
  match = cookie.match(/access_token=([^;]+)/);
  if (match) return match[1];
  
  // Try token
  match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
  if (match) return match[1];
  
  return null;
}

/**
 * Build scenario based on model name.
 */
function getScenario(model: string): string {
  if (model.includes('search')) return 'SCENARIO_SEARCH';
  if (model.includes('research')) return 'SCENARIO_RESEARCH';
  if (model.includes('k1')) return 'SCENARIO_K1';
  return 'SCENARIO_K2';
}

/**
 * Encode a message using Kimi's Connect protocol binary format.
 * Format: [0x00][4-byte big-endian length][JSON payload]
 */
function encodeConnectRequest(message: string, scenario: string): ArrayBuffer {
  const req = {
    scenario,
    message: {
      role: 'user',
      blocks: [{ message_id: '', text: { content: message } }],
      scenario,
    },
    options: { thinking: false },
  };

  const json = JSON.stringify(req);
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(json);

  // 5-byte header: 1 byte (0x00) + 4 bytes (big-endian length)
  const buffer = new ArrayBuffer(5 + jsonBytes.length);
  const view = new DataView(buffer);
  view.setUint8(0, 0x00); // Frame type
  view.setUint32(1, jsonBytes.length, false); // Big-endian length
  new Uint8Array(buffer, 5).set(jsonBytes);

  return buffer;
}

/**
 * Decode Kimi's Connect protocol binary response.
 * Returns the concatenated text content.
 */
function decodeConnectResponse(data: ArrayBuffer): { text: string; error?: string } {
  const u8 = new Uint8Array(data);
  const texts: string[] = [];
  let offset = 0;

  while (offset + 5 <= u8.length) {
    const len = new DataView(u8.buffer, u8.byteOffset + offset + 1, 4).getUint32(0, false);
    if (offset + 5 + len > u8.length) break;

    const chunk = u8.slice(offset + 5, offset + 5 + len);
    try {
      const obj = JSON.parse(new TextDecoder().decode(chunk));
      if (obj.error) {
        return {
          text: '',
          error: obj.error.message || obj.error.code || JSON.stringify(obj.error).slice(0, 200),
        };
      }
      if (obj.block?.text?.content && ['set', 'append'].includes(obj.op || '')) {
        texts.push(obj.block.text.content);
      }
      if (obj.done) break;
    } catch {
      // Ignore parse errors for non-JSON chunks
    }
    offset += 5 + len;
  }

  return { text: texts.join('') };
}

/**
 * Send a chat request to Kimi using Connect protocol.
 * Returns a simplified response (non-streaming collects full response).
 */
export async function kimiChat(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, messages, signal } = params;

  // Build message from conversation history
  const userMessage = messages.filter(m => m.role === 'user').pop()?.content
    || messages.map(m => m.content).join('\n');
  const scenario = getScenario(model);

  // Extract auth token from cookies
  const authToken = extractAuthCookie(credentials.cookie || '');
  
  // Build headers - try with auth token if available, otherwise use cookies only
  const headers: Record<string, string> = {
    'Content-Type': 'application/connect+json',
    'Connect-Protocol-Version': '1',
    'Accept': '*/*',
    'Origin': 'https://www.kimi.com',
    'Referer': 'https://www.kimi.com/',
    'X-Language': 'zh-CN',
    'X-Msh-Platform': 'web',
    'Cookie': credentials.cookie || '',
    'User-Agent': (credentials.userAgent as string) || DEFAULT_USER_AGENT,
  };
  
  // Add Authorization header if we have a token
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const body = encodeConnectRequest(userMessage as string, scenario);

  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: body,
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kimi API error ${res.status}: ${text}`);
  }

  const responseBuffer = await res.arrayBuffer();
  const { text, error } = decodeConnectResponse(responseBuffer);

  if (error) {
    throw new Error(`Kimi API error: ${error}`);
  }

  return createResponse(model, text);
}

/**
 * Send a streaming chat request to Kimi.
 * Note: Kimi's Connect protocol doesn't truly stream like SSE,
 * but we simulate streaming by sending the full response as chunks.
 */
export async function kimiChatStream(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const result = await kimiChat(credentials, params);

  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);
  const content = result.choices[0]?.message?.content || '';

  // Simulate streaming by sending content in chunks
  const chunkSize = 50;
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.slice(i, i + chunkSize);
    sendChunk(callback, params.model, id, created, {
      role: 'assistant',
      content: chunk,
    });
    // Small delay to simulate streaming
    await new Promise(r => setTimeout(r, 10));
  }

  // Send final chunk with finish_reason
  sendChunk(callback, params.model, id, created, {}, 'stop');
}
