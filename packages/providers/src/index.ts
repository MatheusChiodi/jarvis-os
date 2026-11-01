import type { Config, ProviderConfig } from '@jarvis-os/protocol';
import { validateConfig } from '@jarvis-os/protocol';
import { OpenAI } from 'openai';
import pino from 'pino';

const logger = pino({ name: 'providers' });

// ============================================================================
// Types
// ============================================================================

export interface Provider {
  id: string;
  baseUrl: string;
  apiKey?: string;
  client: OpenAI;
}

export interface ModelRef {
  providerId: string;
  model: string;
}

export interface ChatCompletionOptions {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  toolChoice?: OpenAI.Chat.ChatCompletionToolChoiceOption;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResult {
  content: string;
  toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  model: string;
}

export interface StreamChunk {
  content: string;
  toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
  done: boolean;
}

// ============================================================================
// Provider Registry
// ============================================================================

export class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();
  private routes: Map<string, string[]> = new Map();
  private defaultRoute: string[] = [];

  constructor(config: Config) {
    validateConfig(config);

    for (const providerConfig of config.providers) {
      const apiKey = process.env[providerConfig.apiKeyEnv];
      const client = new OpenAI({
        baseURL: providerConfig.baseUrl,
        apiKey: apiKey || 'not-needed',
        defaultHeaders: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        dangerouslyAllowBrowser: false,
      });

      this.providers.set(providerConfig.id, {
        id: providerConfig.id,
        baseUrl: providerConfig.baseUrl,
        apiKey,
        client,
      });

      logger.info(
        { providerId: providerConfig.id, baseUrl: providerConfig.baseUrl },
        'Provider registered'
      );
    }

    this.defaultRoute = config.routes.default;
    for (const [key, value] of Object.entries(config.routes)) {
      if (key !== 'default') {
        this.routes.set(key, value);
      }
    }
  }

  getProvider(providerId: string): Provider | undefined {
    return this.providers.get(providerId);
  }

  parseModelRef(ref: string): ModelRef {
    const colonIndex = ref.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid model reference: ${ref}. Expected format: providerId:model`);
    }
    return {
      providerId: ref.slice(0, colonIndex),
      model: ref.slice(colonIndex + 1),
    };
  }

  resolveModel(routeKey: string): ModelRef[] {
    const route = this.routes.get(routeKey) || this.defaultRoute;
    return route.map((ref) => this.parseModelRef(ref));
  }

  async *chatCompletion(
    options: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const modelRefs = this.resolveModel('default');
    let lastError: Error | null = null;

    for (const modelRef of modelRefs) {
      const provider = this.getProvider(modelRef.providerId);
      if (!provider) {
        logger.warn({ providerId: modelRef.providerId }, 'Provider not found, trying next');
        continue;
      }

      try {
        logger.debug(
          { model: modelRef.model, provider: modelRef.providerId },
          'Attempting chat completion'
        );

        const stream = await provider.client.chat.completions.create({
          model: modelRef.model,
          messages: options.messages,
          tools: options.tools,
          tool_choice: options.toolChoice,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          stream: true,
        });

        let _accumulatedContent = '';
        const accumulatedToolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            _accumulatedContent += delta.content;
            yield { content: delta.content, done: false };
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                while (accumulatedToolCalls.length <= tc.index) {
                  accumulatedToolCalls.push({
                    id: '',
                    type: 'function',
                    function: { name: '', arguments: '' },
                  });
                }
                const existing = accumulatedToolCalls[tc.index];
                if (existing) {
                  if (tc.id) existing.id = tc.id;
                  if (tc.type) existing.type = tc.type;
                  if (tc.function?.name) existing.function.name = tc.function.name;
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                }
              }
            }
          }
        }

        yield {
          content: '',
          toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
          done: true,
        };

        return;
      } catch (error) {
        lastError = error as Error;
        const isRetryable =
          error instanceof OpenAI.APIError &&
          (error.status === 429 ||
            error.status === 500 ||
            error.status === 502 ||
            error.status === 503 ||
            error.status === 504);

        logger.warn(
          {
            providerId: modelRef.providerId,
            model: modelRef.model,
            error: lastError.message,
            retryable: isRetryable,
          },
          'Provider error, trying next in fallback chain'
        );

        if (!isRetryable) {
          throw error;
        }
      }
    }

    throw lastError || new Error('All providers in fallback chain failed');
  }

  async chatCompletionNonStream(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const modelRefs = this.resolveModel('default');
    let lastError: Error | null = null;

    for (const modelRef of modelRefs) {
      const provider = this.getProvider(modelRef.providerId);
      if (!provider) continue;

      try {
        const completion = await provider.client.chat.completions.create({
          model: modelRef.model,
          messages: options.messages,
          tools: options.tools,
          tool_choice: options.toolChoice,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          stream: false,
        });

        const choice = completion.choices[0];
        if (!choice) {
          throw new Error('No completion choice returned');
        }
        return {
          content: choice.message.content || '',
          toolCalls: choice.message.tool_calls,
          usage: completion.usage
            ? {
                promptTokens: completion.usage.prompt_tokens,
                completionTokens: completion.usage.completion_tokens,
              }
            : undefined,
          model: `${modelRef.providerId}:${modelRef.model}`,
        };
      } catch (error) {
        lastError = error as Error;
        const isRetryable =
          error instanceof OpenAI.APIError &&
          (error.status === 429 ||
            error.status === 500 ||
            error.status === 502 ||
            error.status === 503 ||
            error.status === 504);

        if (!isRetryable) throw error;
      }
    }

    throw lastError || new Error('All providers in fallback chain failed');
  }

  listProviders(): ProviderConfig[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      baseUrl: p.baseUrl,
      apiKeyEnv: '',
    }));
  }
}

export function createProviderRegistry(config: Config): ProviderRegistry {
  return new ProviderRegistry(config);
}
