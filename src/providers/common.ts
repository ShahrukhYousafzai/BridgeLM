import { v4 as uuidv4 } from 'uuid';
import type {
  AIProvider,
  ProviderCredentials,
  ProviderInfo,
  ProviderModel,
  ChatParams,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatCompletionMessage,
  StreamCallback,
} from '../gateway/types';

// Utility to create a standard chat completion response
export function createResponse(
  model: string,
  content: string,
  reasoningContent?: string
): ChatCompletionResponse {
  const message: ChatCompletionMessage = { role: 'assistant', content };
  if (reasoningContent) {
    (message as any).reasoning_content = reasoningContent;
  }
  return {
    id: `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

// Utility to send a stream chunk
export function sendChunk(
  callback: StreamCallback,
  model: string,
  id: string,
  created: number,
  delta: Partial<ChatCompletionMessage>,
  finishReason: string | null = null
): void {
  callback({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{
      index: 0,
      delta,
      finish_reason: finishReason,
    }],
  });
}

// Parse SSE stream into text chunks
export async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new Error('No response body');
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;
        yield data;
      }
    }
  }
}

// Convert our messages to a single prompt string (for platforms that need it)
export function messagesToPrompt(messages: ChatCompletionMessage[]): string {
  return messages.map(msg => {
    const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return `[${role}]: ${content}`;
  }).join('\n\n');
}

// Standard User-Agent
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
