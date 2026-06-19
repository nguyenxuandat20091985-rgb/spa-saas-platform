import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';
import { AiProvider, ChatResponse } from '../../../shared/types/ai';
import { AiError } from '../../../shared/utils/errors';
import { createServiceLogger } from '../../../shared/utils/logger';
import { AiConfig } from '../../../shared/config';

const logger = createServiceLogger('ai-provider');

export interface AiCompletionRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface AiCompletionResponse {
  content: string;
  tokensUsed: number;
  model: string;
  provider: AiProvider;
}

export interface AiEmbeddingResponse {
  embedding: number[];
  model: string;
  provider: AiProvider;
}

export class AiProviderService {
  private geminiClient: GoogleGenerativeAI | null = null;
  private config: AiConfig;
  private fallbackOrder: AiProvider[] = ['gemini', 'openai', 'claude', 'deepseek'];

  constructor(config: AiConfig) {
    this.config = config;
    this.initializeProviders();
  }

  private initializeProviders(): void {
    if (this.config.gemini.apiKey) {
      this.geminiClient = new GoogleGenerativeAI(this.config.gemini.apiKey);
      logger.info('Gemini provider initialized');
    }
    // OpenAI, Claude, DeepSeek would be initialized here similarly
  }

  async complete(request: AiCompletionRequest, preferredProvider?: AiProvider): Promise<AiCompletionResponse> {
    const provider = preferredProvider || (this.config.defaultProvider as AiProvider);
    const providerOrder = [provider, ...this.fallbackOrder.filter((p) => p !== provider)];

    for (const p of providerOrder) {
      try {
        switch (p) {
          case 'gemini':
            return await this.completeWithGemini(request);
          case 'openai':
            return await this.completeWithOpenAi(request);
          case 'claude':
            return await this.completeWithClaude(request);
          case 'deepseek':
            return await this.completeWithDeepSeek(request);
          default:
            continue;
        }
      } catch (error) {
        logger.warn(`Provider ${p} failed, trying next`, { error });
        continue;
      }
    }

    throw new AiError('All AI providers failed');
  }

  async embed(text: string, preferredProvider?: AiProvider): Promise<AiEmbeddingResponse> {
    const provider = preferredProvider || (this.config.defaultProvider as AiProvider);

    switch (provider) {
      case 'gemini':
        return await this.embedWithGemini(text);
      default:
        return await this.embedWithGemini(text);
    }
  }

  async embedBatch(texts: string[]): Promise<AiEmbeddingResponse[]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  private async completeWithGemini(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.geminiClient) {
      throw new AiError('Gemini client not initialized');
    }

    const model = this.geminiClient.getGenerativeModel({
      model: this.config.gemini.model,
    });

    // Build Gemini-compatible message format
    const systemInstruction = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');

    const contents: Content[] = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const result = await model.generateContent({
      contents,
      systemInstruction: systemInstruction || undefined,
      generationConfig: {
        maxOutputTokens: request.maxTokens || 4096,
        temperature: request.temperature || 0.7,
      },
    });

    const response = result.response;
    const text = response.text();
    const usage = response.usageMetadata;

    return {
      content: text,
      tokensUsed: (usage?.totalTokenCount) || 0,
      model: this.config.gemini.model,
      provider: 'gemini',
    };
  }

  private async embedWithGemini(text: string): Promise<AiEmbeddingResponse> {
    if (!this.geminiClient) {
      throw new AiError('Gemini client not initialized');
    }

    const model = this.geminiClient.getGenerativeModel({
      model: this.config.gemini.embeddingModel,
    });

    const result = await model.embedContent(text);
    const embedding = result.embedding;

    return {
      embedding: embedding.values,
      model: this.config.gemini.embeddingModel,
      provider: 'gemini',
    };
  }

  // Placeholder implementations for other providers
  private async completeWithOpenAi(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.config.openai?.apiKey) throw new AiError('OpenAI not configured');

    // HTTP call to OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.openai.model,
        messages: request.messages,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature || 0.7,
      }),
    });

    if (!response.ok) throw new AiError(`OpenAI API error: ${response.status}`);
    const data = await response.json() as Record<string, any>;

    return {
      content: data.choices[0].message.content,
      tokensUsed: data.usage.total_tokens,
      model: this.config.openai.model,
      provider: 'openai',
    };
  }

  private async completeWithClaude(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.config.claude?.apiKey) throw new AiError('Claude not configured');

    const systemMsg = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const messages = request.messages.filter((m) => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.claude.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.claude.model,
        max_tokens: request.maxTokens || 4096,
        system: systemMsg,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) throw new AiError(`Claude API error: ${response.status}`);
    const data = await response.json() as Record<string, any>;

    return {
      content: data.content[0].text,
      tokensUsed: data.usage.input_tokens + data.usage.output_tokens,
      model: this.config.claude.model,
      provider: 'claude',
    };
  }

  private async completeWithDeepSeek(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.config.deepseek?.apiKey) throw new AiError('DeepSeek not configured');

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.deepseek.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.deepseek.model,
        messages: request.messages,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature || 0.7,
      }),
    });

    if (!response.ok) throw new AiError(`DeepSeek API error: ${response.status}`);
    const data = await response.json() as Record<string, any>;

    return {
      content: data.choices[0].message.content,
      tokensUsed: data.usage.total_tokens,
      model: this.config.deepseek.model,
      provider: 'deepseek',
    };
  }
}
