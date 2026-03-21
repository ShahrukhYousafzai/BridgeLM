// OpenAI-compatible API types
export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ContentPart {
  type: 'text' | 'image_url' | 'input_audio';
  text?: string;
  image_url?: { url: string; detail?: string };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: ToolDefinition[];
  tool_choice?: string | { type: string; function: { name: string } };
  response_format?: { type: string; json_schema?: Record<string, unknown> };
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: string | null;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: Partial<ChatCompletionMessage>;
  finish_reason: string | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: Usage;
}

export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  usage?: Usage;
}

// Provider types
export interface ProviderCredentials {
  cookie: string;
  bearer?: string;
  accessToken?: string;
  sessionKey?: string;
  userAgent: string;
  [key: string]: unknown;
}

export interface ProviderModel {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning?: boolean;
  multimodal?: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  models: ProviderModel[];
  url: string;
  authFields: AuthField[];
}

export interface AuthField {
  name: string;
  label: string;
  type: 'cookie' | 'bearer' | 'token' | 'sessionKey' | 'text';
  required: boolean;
  description?: string;
}

// Stream callback
export type StreamCallback = (chunk: ChatCompletionChunk) => void;

// Provider interface — each provider implements this
export interface AIProvider {
  readonly info: ProviderInfo;
  authenticate(params: AuthParams): Promise<ProviderCredentials>;
  chat(params: ChatParams): Promise<ChatCompletionResponse>;
  chatStream(params: ChatParams, callback: StreamCallback): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export interface AuthParams {
  onProgress: (message: string) => void;
  signal?: AbortSignal;
}

export interface ChatParams {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

// Config
export interface GatewayConfig {
  port: number;
  apiKey: string;
  providers: Record<string, ProviderConfig>;
}

export interface ProviderConfig {
  enabled: boolean;
  credentials: ProviderCredentials;
  defaultModel?: string;
}
