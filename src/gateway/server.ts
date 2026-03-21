import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { ProviderManager } from './provider-manager';
import type { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk } from './types';

export function createGatewayServer(manager: ProviderManager, apiKey?: string): express.Express {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Auth middleware — checks Bearer token against configured API key
  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (apiKey) {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
        return res.status(401).json({ error: { message: 'Invalid API key. Use: Authorization: Bearer <your-key>', type: 'authentication_error' } });
      }
    }
    next();
  };

  // GET /v1/models
  app.get('/v1/models', (_req, res) => {
    const models = manager.listModels();
    res.json({ object: 'list', data: models });
  });

  // POST /v1/chat/completions
  app.post('/v1/chat/completions', authMiddleware, async (req, res) => {
    try {
      const body: ChatCompletionRequest = req.body;

      if (!body.model) {
        return res.status(400).json({ error: { message: 'model is required', type: 'invalid_request' } });
      }
      if (!body.messages || body.messages.length === 0) {
        return res.status(400).json({ error: { message: 'messages is required', type: 'invalid_request' } });
      }

      const resolved = manager.resolveModel(body.model);
      if (!resolved) {
        return res.status(404).json({
          error: {
            message: `Model '${body.model}' not found. Use GET /v1/models to list available models.`,
            type: 'not_found',
          },
        });
      }

      const { provider, modelId } = resolved;

      if (body.stream) {
        // Streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const completionId = `chatcmpl-${uuidv4().replace(/-/g, '').slice(0, 24)}`;
        const created = Math.floor(Date.now() / 1000);

        try {
          await provider.chatStream(
            {
              model: modelId,
              messages: body.messages,
              temperature: body.temperature,
              maxTokens: body.max_tokens,
              tools: body.tools,
              signal: (req as any).abortController?.signal,
            },
            (chunk: ChatCompletionChunk) => {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
          );
          res.write('data: [DONE]\n\n');
          res.end();
        } catch {
          const errorChunk = {
            id: completionId,
            object: 'chat.completion.chunk' as const,
            created,
            model: body.model,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: 'error',
            }],
          };
          res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } else {
        // Non-streaming response
        const result = await provider.chat({
          model: modelId,
          messages: body.messages,
          temperature: body.temperature,
          maxTokens: body.max_tokens,
          tools: body.tools,
        });
        res.json(result);
      }
    } catch (err: any) {
      console.error('[Gateway] Error:', err);
      res.status(500).json({
        error: {
          message: err.message || 'Internal server error',
          type: 'server_error',
        },
      });
    }
  });

  // GET /health
  app.get('/health', async (_req, res) => {
    const providers = manager.getActiveProviders();
    const status: Record<string, boolean> = {};
    for (const [id, provider] of providers) {
      try {
        status[id] = await provider.isHealthy();
      } catch {
        status[id] = false;
      }
    }
    res.json({ status: 'ok', providers: status });
  });

  return app;
}
