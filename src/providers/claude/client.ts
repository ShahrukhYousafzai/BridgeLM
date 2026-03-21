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

const ORGS_URL = 'https://claude.ai/api/organizations';

interface ClaudeConversation {
  uuid: string;
  name: string;
}

/**
 * Discover the organization ID from the Claude API.
 */
async function discoverOrganizationId(credentials: ProviderCredentials): Promise<string> {
  const res = await fetch(ORGS_URL, {
    method: 'GET',
    headers: {
      'Cookie': credentials.cookie,
      'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
      'anthropic-client-platform': 'web_claude_ai',
      'Origin': 'https://claude.ai',
      'Referer': 'https://claude.ai/',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Claude organizations: ${res.status}`);
  }

  const orgs = (await res.json()) as any[];
  if (!orgs || orgs.length === 0 || !orgs[0].uuid) {
    throw new Error('No Claude organizations found');
  }

  return orgs[0].uuid;
}

/**
 * Create a new conversation within the given organization.
 */
async function createConversation(
  credentials: ProviderCredentials,
  orgId: string
): Promise<ClaudeConversation> {
  const url = `${ORGS_URL}/${orgId}/chat_conversations`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': credentials.cookie,
      'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
      'anthropic-client-platform': 'web_claude_ai',
      'Origin': 'https://claude.ai',
      'Referer': 'https://claude.ai/',
    },
    body: JSON.stringify({
      name: `Conversation ${new Date().toISOString()}`,
      uuid: crypto.randomUUID(),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create Claude conversation: ${res.status} - ${text}`);
  }

  return (await res.json()) as ClaudeConversation;
}

/**
 * Build the common headers for Claude API requests.
 */
function buildHeaders(credentials: ProviderCredentials): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Cookie': credentials.cookie,
    'User-Agent': credentials.userAgent || DEFAULT_USER_AGENT,
    'Accept': 'text/event-stream',
    'anthropic-client-platform': 'web_claude_ai',
    'anthropic-device-id': credentials.sessionKey
      ? crypto.createHash('md5').update(credentials.sessionKey).digest('hex')
      : crypto.randomUUID(),
    'Origin': 'https://claude.ai',
    'Referer': 'https://claude.ai/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
}

/**
 * Convert ChatParams messages into a single prompt string for Claude Web API.
 */
function messagesToPrompt(params: ChatParams): string {
  return params.messages.map(msg => {
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return `[${role}]: ${content}`;
  }).join('\n\n');
}

/**
 * Send a non-streaming chat completion request to Claude Web.
 */
export async function claudeChat(
  credentials: ProviderCredentials,
  params: ChatParams
): Promise<ChatCompletionResponse> {
  const { model, signal } = params;

  const orgId = credentials.organizationId as string || await discoverOrganizationId(credentials);
  const conversation = await createConversation(credentials, orgId);

  const url = `${ORGS_URL}/${orgId}/chat_conversations/${conversation.uuid}/completion`;
  const prompt = messagesToPrompt(params);

  const body: Record<string, unknown> = {
    prompt,
    parent_message_uuid: '00000000-0000-4000-8000-000000000000',
    model,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    rendering_mode: 'messages',
    attachments: [],
    files: [],
    locale: 'en-US',
    personalized_styles: [],
    sync_sources: [],
    tools: [],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(credentials),
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  // Claude Web returns SSE; parse the full body and extract text
  const chunks: string[] = [];
  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.completion) {
        chunks.push(parsed.completion);
      }
      if (parsed.delta?.text) {
        chunks.push(parsed.delta.text);
      }
    } catch {
      // Skip malformed lines
    }
  }

  const content = chunks.join('');
  return createResponse(model, content);
}

/**
 * Send a streaming chat completion request to Claude Web.
 * Parses the SSE stream and invokes the callback for each chunk.
 */
export async function claudeChatStream(
  credentials: ProviderCredentials,
  params: ChatParams,
  callback: StreamCallback
): Promise<void> {
  const { model, signal } = params;

  const orgId = credentials.organizationId as string || await discoverOrganizationId(credentials);
  const conversation = await createConversation(credentials, orgId);

  const url = `${ORGS_URL}/${orgId}/chat_conversations/${conversation.uuid}/completion`;
  const prompt = messagesToPrompt(params);

  const body: Record<string, unknown> = {
    prompt,
    parent_message_uuid: '00000000-0000-4000-8000-000000000000',
    model,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    rendering_mode: 'messages',
    attachments: [],
    files: [],
    locale: 'en-US',
    personalized_styles: [],
    sync_sources: [],
    tools: [],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(credentials),
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const id = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  const created = Math.floor(Date.now() / 1000);

  for await (const data of parseSSEStream(res)) {
    try {
      const parsed = JSON.parse(data);

      // Claude Web SSE format: { completion: "text", stop_reason: null }
      const content = parsed.completion ?? parsed.delta?.text ?? '';
      const stopReason = parsed.stop_reason;

      if (content) {
        sendChunk(callback, model, id, created, {
          role: 'assistant',
          content,
        });
      }

      if (stopReason === 'stop_sequence' || stopReason === 'end_turn') {
        sendChunk(callback, model, id, created, {}, 'stop');
      }
    } catch {
      // Skip malformed JSON lines
    }
  }
}
