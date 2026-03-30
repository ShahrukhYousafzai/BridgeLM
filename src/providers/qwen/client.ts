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

const BASE_URL = 'https://chat.qwen.ai';
const CREATE_CHAT_URL = `${BASE_URL}/api/v2/chats/new`;
const CHAT_COMPLETIONS_URL = `${BASE_URL}/api/v2/chat/completions`;

/**
 * Create a new chat session and return the chat_id.
 */
async function createChatSession(
  credentials: ProviderCredentials,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(CREATE_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': credentials.cookie || '',
      'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
      'Referer': `${BASE_URL}/`,
      'Origin': BASE_URL,
    },
    body: JSON.stringify({}),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qwen create chat error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as any;
  const chatId = data.data?.id ?? data.chat_id ?? data.id ?? data.chatId;

  if (!chatId) {
    throw new Error(`Qwen: No chat_id in response: ${JSON.stringify(data)}`);
  }

  return chatId;
}

/**
 * Send a non-streaming chat request to Qwen International.
 * Creates a chat session first, then sends the message.
 */
export async function chatQwen(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, messages, temperature, maxTokens, signal } = params;

  // Step 1: Create a new chat session
  const chatId = await createChatSession(credentials, signal);

  // Step 2: Build the message payload
  const userMessage = messages.filter(m => m.role === 'user').pop()?.content
    || messages.map(m => m.content).join('\n');

  const fid = uuidv4();
  const body: Record<string, unknown> = {
    stream: false,
    version: '2.1',
    incremental_output: true,
    chat_id: chatId,
    chat_mode: 'normal',
    model: model,
    parent_id: null,
    messages: [
      {
        fid,
        parentId: null,
        childrenIds: [],
        role: 'user',
        content: userMessage,
        bits: [],
        feature_config: {
          think_tags: true,
          output_format: 'raw',
        },
        parent_fid: null,
        mentioned: [],
      },
    ],
  };

  const res = await fetch(`${CHAT_COMPLETIONS_URL}?chat_id=${chatId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': credentials.cookie || '',
      'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
      'Referer': `${BASE_URL}/`,
      'Origin': BASE_URL,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qwen API error ${res.status}: ${text}`);
  }

  // Collect all content from SSE stream
  let content = '';
  let reasoningContent = '';
  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  try {
    for await (const data of parseSSEStream(res)) {
      try {
        const parsed = JSON.parse(data);
        // Qwen v2 returns messages array with content
        if (parsed.messages) {
          for (const msg of parsed.messages) {
            if (msg.content) content += msg.content;
          }
        } else if (parsed.choices?.[0]?.delta?.content) {
          content += parsed.choices[0].delta.content;
        } else if (parsed.output?.content) {
          content += parsed.output.content;
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
        const assistantMsg = Array.isArray(json.messages)
          ? json.messages.find((m: any) => m.role === 'assistant')
          : null;
        content = json.choices?.[0]?.message?.content
          || json.output?.content
          || assistantMsg?.content
          || text;
      } catch {
        content = text;
      }
    }
  }

  return createResponse(model, content, reasoningContent || undefined);
}

/**
 * Send a streaming chat request to Qwen International.
 */
export async function chatStreamQwen(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const { model, messages, temperature, maxTokens, signal } = params;

  // Step 1: Create a new chat session
  const chatId = await createChatSession(credentials, signal);

  // Step 2: Build the message payload
  const userMessage = messages.filter(m => m.role === 'user').pop()?.content
    || messages.map(m => m.content).join('\n');

  const fid = uuidv4();
  const body: Record<string, unknown> = {
    stream: true,
    version: '2.1',
    incremental_output: true,
    chat_id: chatId,
    chat_mode: 'normal',
    model: model,
    parent_id: null,
    messages: [
      {
        fid,
        parentId: null,
        childrenIds: [],
        role: 'user',
        content: userMessage,
        bits: [],
        feature_config: {
          think_tags: true,
          output_format: 'raw',
        },
        parent_fid: null,
        mentioned: [],
      },
    ],
  };

  const res = await fetch(`${CHAT_COMPLETIONS_URL}?chat_id=${chatId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': credentials.cookie || '',
      'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
      'Referer': `${BASE_URL}/`,
      'Origin': BASE_URL,
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
      const parsed = JSON.parse(data);

      // Handle different response formats
      let content: string | null = null;
      let finishReason: string | null = null;

      if (parsed.messages) {
        // Qwen v2 format with messages array
        for (const msg of parsed.messages) {
          if (msg.content && msg.role === 'assistant') {
            content = msg.content;
          }
        }
      } else if (parsed.choices?.[0]?.delta?.content) {
        content = parsed.choices[0].delta.content;
        finishReason = parsed.choices[0].finish_reason || null;
      } else if (parsed.output?.content) {
        content = parsed.output.content;
      }

      if (content) {
        sendChunk(callback, model, id, created, {
          role: 'assistant',
          content,
        }, finishReason);
      }

      if (finishReason === 'stop' || parsed.done) {
        sendChunk(callback, model, id, created, {}, 'stop');
        break;
      }
    } catch {
      // Skip malformed JSON chunks
    }
  }
}
