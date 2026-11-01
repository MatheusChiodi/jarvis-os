import type { Config } from '@jarvis-os/protocol';
import { OpenAI } from 'openai';
import { config } from '../config.js';

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
  messages: any[];
  tools?: any[];
  toolChoice?: any;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResult {
  content: string;
  toolCalls?: any[];
  usage?: { promptTokens: number; completionTokens: number };
  model: string;
}

export interface StreamChunk {
  content: string;
  toolCalls?: any[];
  done: boolean;
}

export class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();
  private routes: Map<string, string[]> = new Map();
  private defaultRoute: string[] = [];

  constructor(config: Config) {
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

      console.log(`Provider registered: ${providerConfig.id} at ${providerConfig.baseUrl}`);
    }

    this.defaultRoute = config.routes.default;
    for (const [key, value] of Object.entries(config.routes)) {
      if (key !== 'default') {
        this.routes.set(key, value);
      }
    }
  }

  getProvider(providerId: string) {
    return this.providers.get(providerId);
  }

  parseModelRef(ref: string) {
    const colonIndex = ref.indexOf(':');
    if (colonIndex === -1) {
      throw new Error(`Invalid model reference: ${ref}. Expected format: providerId:model`);
    }
    return {
      providerId: ref.slice(0, colonIndex),
      model: ref.slice(colonIndex + 1),
    };
  }

  resolveModel(routeKey: string) {
    const route = this.routes.get(routeKey) || this.defaultRoute;
    return route.map((ref) => this.parseModelRef(ref));
  }

  async *chatCompletion(options: any): AsyncGenerator<any, void, unknown> {
    const modelRefs = this.resolveModel('default');

    for (const modelRef of modelRefs) {
      const provider = this.getProvider(modelRef.providerId);
      if (!provider) {
        console.warn(`Provider not found: ${modelRef.providerId}, trying next`);
        continue;
      }

      try {
        const stream = await provider.client.chat.completions.create({
          model: modelRef.model,
          messages: options.messages,
          tools: options.tools,
          tool_choice: options.toolChoice,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          stream: true,
        });

        const accumulatedToolCalls: any[] = [];

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            yield { content: delta.content, toolCalls: undefined, done: false };
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
                if (tc.id) existing.id = tc.id;
                if (tc.type) existing.type = tc.type;
                if (tc.function?.name) existing.function.name = tc.function.name;
                if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
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
        const isRetryable =
          (error as any).status === 429 ||
          (error as any).status === 500 ||
          (error as any).status === 502 ||
          (error as any).status === 503 ||
          (error as any).status === 504;
        console.warn(
          {
            providerId: modelRef.providerId,
            model: modelRef.model,
            error: (error as Error).message,
            retryable: isRetryable,
          },
          'Provider error, trying next in fallback chain'
        );
        if (!isRetryable) {
          throw error;
        }
      }
    }

    throw new Error('All providers in fallback chain failed');
  }
}

export const providerRegistry = new ProviderRegistry(config);
