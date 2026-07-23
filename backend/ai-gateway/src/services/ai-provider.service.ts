import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';
import { AiProvider, ChatResponse, AiCompletionRequest, AiCompletionResponse, AiEmbeddingResponse } from '../../../shared/types/ai';
import { AiError, RateLimitError } from '../../../shared/utils/errors';
import { createServiceLogger } from '../../../shared/utils/logger';
import { AiConfig } from '../../../shared/config';

const logger = createServiceLogger('ai-provider');

// ==========================================
// INTERFACE
// ==========================================
interface ProviderStats {
  provider: AiProvider;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  avgLatency: number;
  lastUsed: Date;
  isHealthy: boolean;
}

// ==========================================
// AI PROVIDER SERVICE
// ==========================================
export class AiProviderService {
  private geminiClient: GoogleGenerativeAI | null = null;
  private config: AiConfig;
  private fallbackOrder: AiProvider[] = ['gemini', 'openai', 'claude', 'deepseek'];
  private providerStats: Map<AiProvider, ProviderStats> = new Map();
  private circuitBreakers: Map<AiProvider, { failures: number; lastFailure: Date; isOpen: boolean }> = new Map();
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 60 seconds

  constructor(config: AiConfig) {
    this.config = config;
    this.initializeProviders();
    this.initializeStats();
  }

  private initializeProviders(): void {
    if (this.config.gemini?.apiKey) {
      this.geminiClient = new GoogleGenerativeAI(this.config.gemini.apiKey);
      logger.info('Gemini provider initialized', { model: this.config.gemini.model });
    }

    if (this.config.openai?.apiKey) {
      logger.info('OpenAI provider initialized', { model: this.config.openai.model });
    }

    if (this.config.claude?.apiKey) {
      logger.info('Claude provider initialized', { model: this.config.claude.model });
    }

    if (this.config.deepseek?.apiKey) {
      logger.info('DeepSeek provider initialized', { model: this.config.deepseek.model });
    }
  }

  private initializeStats(): void {
    for (const provider of this.fallbackOrder) {
      this.providerStats.set(provider, {
        provider,
        successCount: 0,
        failureCount: 0,
        totalTokens: 0,
        avgLatency: 0,
        lastUsed: new Date(0),
        isHealthy: true,
      });
      this.circuitBreakers.set(provider, { failures: 0, lastFailure: new Date(0), isOpen: false });
    }
  }

  // ==========================================
  // 1. COMPLETE (VỚI FALLBACK & CIRCUIT BREAKER)
  // ==========================================
  async complete(
    request: AiCompletionRequest,
    preferredProvider?: AiProvider,
    tenantId?: string,
  ): Promise<AiCompletionResponse> {
    const startTime = Date.now();
    const provider = preferredProvider || (this.config.defaultProvider as AiProvider);
    const providerOrder = this.getProviderOrder(provider);

    let lastError: Error | null = null;

    for (const p of providerOrder) {
      // Check circuit breaker
      if (this.isCircuitOpen(p)) {
        logger.warn(`Circuit breaker open for ${p}, skipping`);
        continue;
      }

      try {
        const result = await this.completeWithProvider(request, p, tenantId);
        const latency = Date.now() - startTime;

        // Update stats
        this.updateStats(p, true, latency, result.tokensUsed);
        this.resetCircuitBreaker(p);

        logger.info(`AI completion successful`, {
          provider: p,
          tokensUsed: result.tokensUsed,
          latency,
          tenantId,
        });

        return result;
      } catch (error) {
        lastError = error as Error;
        this.updateStats(p, false, 0, 0);
        this.recordFailure(p);

        logger.warn(`Provider ${p} failed`, {
          error: error instanceof Error ? error.message : String(error),
          tenantId,
        });
        continue;
      }
    }

    throw new AiError(
      `All AI providers failed. Last error: ${lastError?.message || 'Unknown error'}`,
      { provider: providerOrder.join(', ') },
    );
  }

  // ==========================================
  // 2. COMPLETE WITH STREAM
  // ==========================================
  async *completeStream(
    request: AiCompletionRequest,
    preferredProvider?: AiProvider,
    tenantId?: string,
  ): AsyncGenerator<{ chunk: string; done: boolean; tokensUsed?: number }> {
    const provider = preferredProvider || (this.config.defaultProvider as AiProvider);
    const providerOrder = this.getProviderOrder(provider);

    let lastError: Error | null = null;

    for (const p of providerOrder) {
      if (this.isCircuitOpen(p)) {
        logger.warn(`Circuit breaker open for ${p}, skipping`);
        continue;
      }

      try {
        const stream = this.completeStreamWithProvider(request, p, tenantId);
        let fullContent = '';
        let tokensUsed = 0;

        for await (const chunk of stream) {
          if (!chunk.done) {
            fullContent += chunk.chunk;
            yield { chunk: chunk.chunk, done: false };
          } else {
            tokensUsed = chunk.tokensUsed || 0;
            this.updateStats(p, true, 0, tokensUsed);
            this.resetCircuitBreaker(p);
            yield { chunk: '', done: true, tokensUsed };
          }
        }

        logger.info(`AI stream completed`, {
          provider: p,
          tokensUsed,
          tenantId,
        });

        return;
      } catch (error) {
        lastError = error as Error;
        this.updateStats(p, false, 0, 0);
        this.recordFailure(p);

        logger.warn(`Provider ${p} stream failed`, {
          error: error instanceof Error ? error.message : String(error),
          tenantId,
        });
        continue;
      }
    }

    throw new AiError(
      `All AI providers failed for streaming. Last error: ${lastError?.message || 'Unknown error'}`,
    );
  }

  // ==========================================
  // 3. EMBED
  // ==========================================
  async embed(text: string, preferredProvider?: AiProvider): Promise<AiEmbeddingResponse> {
    const provider = preferredProvider || (this.config.defaultProvider as AiProvider);

    switch (provider) {
      case 'gemini':
        return await this.embedWithGemini(text);
      case 'openai':
        return await this.embedWithOpenAI(text);
      default:
        return await this.embedWithGemini(text);
    }
  }

  async embedBatch(texts: string[], preferredProvider?: AiProvider): Promise<AiEmbeddingResponse[]> {
    const results: AiEmbeddingResponse[] = [];
    for (const text of texts) {
      results.push(await this.embed(text, preferredProvider));
    }
    return results;
  }

  // ==========================================
  // 4. STATS & HEALTH
  // ==========================================
  getProviderStats(): ProviderStats[] {
    return Array.from(this.providerStats.values());
  }

  getProviderHealth(provider: AiProvider): {
    isHealthy: boolean;
    circuitOpen: boolean;
    successRate: number;
  } {
    const stats = this.providerStats.get(provider);
    const circuit = this.circuitBreakers.get(provider);

    if (!stats || !circuit) {
      return { isHealthy: false, circuitOpen: true, successRate: 0 };
    }

    const total = stats.successCount + stats.failureCount;
    const successRate = total > 0 ? (stats.successCount / total) * 100 : 0;

    return {
      isHealthy: stats.isHealthy,
      circuitOpen: circuit.isOpen,
      successRate,
    };
  }

  async switchProvider(provider: AiProvider, apiKey?: string): Promise<boolean> {
    logger.info(`Switching to provider: ${provider}`);

    switch (provider) {
      case 'gemini':
        if (apiKey) {
          this.config.gemini.apiKey = apiKey;
          this.geminiClient = new GoogleGenerativeAI(apiKey);
        }
        break;
      case 'openai':
        if (apiKey) {
          this.config.openai = { ...this.config.openai, apiKey };
        }
        break;
      case 'claude':
        if (apiKey) {
          this.config.claude = { ...this.config.claude, apiKey };
        }
        break;
      case 'deepseek':
        if (apiKey) {
          this.config.deepseek = { ...this.config.deepseek, apiKey };
        }
        break;
      default:
        throw new AiError(`Unknown provider: ${provider}`);
    }

    this.resetCircuitBreaker(provider);
    (this.providerStats.get(provider) || {}).isHealthy = true;

    logger.info(`Provider switched successfully: ${provider}`);
    return true;
  }

  // ==========================================
  // 5. PROVIDER IMPLEMENTATIONS
  // ==========================================

  private async completeWithProvider(
    request: AiCompletionRequest,
    provider: AiProvider,
    tenantId?: string,
  ): Promise<AiCompletionResponse> {
    switch (provider) {
      case 'gemini':
        return await this.completeWithGemini(request);
      case 'openai':
        return await this.completeWithOpenAi(request);
      case 'claude':
        return await this.completeWithClaude(request);
      case 'deepseek':
        return await this.completeWithDeepSeek(request);
      default:
        throw new AiError(`Unknown provider: ${provider}`);
    }
  }

  private async *completeStreamWithProvider(
    request: AiCompletionRequest,
    provider: AiProvider,
    tenantId?: string,
  ): AsyncGenerator<{ chunk: string; done: boolean; tokensUsed?: number }> {
    switch (provider) {
      case 'gemini':
        yield* this.completeStreamWithGemini(request);
        break;
      case 'openai':
        yield* this.completeStreamWithOpenAI(request);
        break;
      default:
        throw new AiError(`Streaming not supported for provider: ${provider}`);
    }
  }

  // ==========================================
  // 6. GEMINI IMPLEMENTATION
  // ==========================================

  private async completeWithGemini(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.geminiClient) {
      throw new AiError('Gemini client not initialized');
    }

    const model = this.geminiClient.getGenerativeModel({
      model: this.config.gemini.model,
    });

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

    // Check for safety ratings
    const safetyRatings = response.promptFeedback?.safetyRatings;
    if (safetyRatings?.some((r: any) => r.probability === 'HIGH' || r.probability === 'MEDIUM')) {
      logger.warn('Gemini content safety warning', { safetyRatings });
    }

    return {
      content: text,
      tokensUsed: usage?.totalTokenCount || 0,
      model: this.config.gemini.model,
      provider: 'gemini',
    };
  }

  private async *completeStreamWithGemini(
    request: AiCompletionRequest,
  ): AsyncGenerator<{ chunk: string; done: boolean; tokensUsed?: number }> {
    if (!this.geminiClient) {
      throw new AiError('Gemini client not initialized');
    }

    const model = this.geminiClient.getGenerativeModel({
      model: this.config.gemini.model,
    });

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

    const result = await model.generateContentStream({
      contents,
      systemInstruction: systemInstruction || undefined,
      generationConfig: {
        maxOutputTokens: request.maxTokens || 4096,
        temperature: request.temperature || 0.7,
      },
    });

    let fullText = '';
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullText += text;
        yield { chunk: text, done: false };
      }
    }

    yield { chunk: '', done: true, tokensUsed: fullText.length / 4 }; // Approximate token count
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

  // ==========================================
  // 7. OPENAI IMPLEMENTATION
  // ==========================================

  private async completeWithOpenAi(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.config.openai?.apiKey) {
      throw new AiError('OpenAI not configured');
    }

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
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AiError(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, any>;

    return {
      content: data.choices[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens || 0,
      model: this.config.openai.model,
      provider: 'openai',
    };
  }

  private async *completeStreamWithOpenAI(
    request: AiCompletionRequest,
  ): AsyncGenerator<{ chunk: string; done: boolean; tokensUsed?: number }> {
    if (!this.config.openai?.apiKey) {
      throw new AiError('OpenAI not configured');
    }

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
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AiError(`OpenAI API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new AiError('No response body');
    }

    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            yield { chunk: '', done: true, tokensUsed: Math.ceil(fullText.length / 4) };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              yield { chunk: content, done: false };
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    yield { chunk: '', done: true, tokensUsed: Math.ceil(fullText.length / 4) };
  }

  private async embedWithOpenAI(text: string): Promise<AiEmbeddingResponse> {
    if (!this.config.openai?.apiKey) {
      throw new AiError('OpenAI not configured');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.openai.apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      throw new AiError(`OpenAI embedding error: ${response.status}`);
    }

    const data = await response.json() as Record<string, any>;

    return {
      embedding: data.data[0]?.embedding || [],
      model: 'text-embedding-3-small',
      provider: 'openai',
    };
  }

  // ==========================================
  // 8. CLAUDE IMPLEMENTATION
  // ==========================================

  private async completeWithClaude(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.config.claude?.apiKey) {
      throw new AiError('Claude not configured');
    }

    const systemMsg = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');

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
        system: systemMsg || undefined,
        messages: messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AiError(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, any>;

    return {
      content: data.content?.[0]?.text || '',
      tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      model: this.config.claude.model,
      provider: 'claude',
    };
  }

  // ==========================================
  // 9. DEEPSEEK IMPLEMENTATION
  // ==========================================

  private async completeWithDeepSeek(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    if (!this.config.deepseek?.apiKey) {
      throw new AiError('DeepSeek not configured');
    }

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
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AiError(`DeepSeek API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as Record<string, any>;

    return {
      content: data.choices[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens || 0,
      model: this.config.deepseek.model,
      provider: 'deepseek',
    };
  }

  // ==========================================
  // 10. GET USAGE STATS
  // ==========================================
  async getUsageStats(tenantId: string, startDate?: string, endDate?: string): Promise<{
    totalTokens: number;
    totalMessages: number;
    estimatedCost: number;
    byProvider: Record<AiProvider, { tokens: number; messages: number; cost: number }>;
  }> {
    // This would typically query a database table
    // For now, return aggregated stats from memory
    const stats = Array.from(this.providerStats.values());
    const totalTokens = stats.reduce((sum, s) => sum + s.totalTokens, 0);
    const totalMessages = stats.reduce((sum, s) => sum + s.successCount, 0);

    const byProvider = {} as Record<AiProvider, { tokens: number; messages: number; cost: number }>;
    for (const s of stats) {
      const costPerToken = this.getCostPerToken(s.provider);
      byProvider[s.provider] = {
        tokens: s.totalTokens,
        messages: s.successCount,
        cost: s.totalTokens * costPerToken,
      };
    }

    return {
      totalTokens,
      totalMessages,
      estimatedCost: totalTokens * 0.00001, // Approximate cost
      byProvider,
    };
  }

  private getCostPerToken(provider: AiProvider): number {
    const rates: Record<AiProvider, number> = {
      gemini: 0.00000035,
      openai: 0.000001,
      claude: 0.000008,
      deepseek: 0.00000028,
    };
    return rates[provider] || 0.000001;
  }

  // ==========================================
  // 11. UTILITY FUNCTIONS
  // ==========================================

  private getProviderOrder(preferred: AiProvider): AiProvider[] {
    const order = [preferred];
    for (const p of this.fallbackOrder) {
      if (p !== preferred && !order.includes(p)) {
        // Check if provider is configured
        const hasKey = this.getProviderApiKey(p);
        if (hasKey) {
          order.push(p);
        }
      }
    }
    return order;
  }

  private getProviderApiKey(provider: AiProvider): string | undefined {
    switch (provider) {
      case 'gemini': return this.config.gemini?.apiKey;
      case 'openai': return this.config.openai?.apiKey;
      case 'claude': return this.config.claude?.apiKey;
      case 'deepseek': return this.config.deepseek?.apiKey;
      default: return undefined;
    }
  }

  private updateStats(provider: AiProvider, success: boolean, latency: number, tokens: number): void {
    const stats = this.providerStats.get(provider);
    if (!stats) return;

    if (success) {
      stats.successCount++;
      stats.totalTokens += tokens;
      stats.avgLatency = (stats.avgLatency * (stats.successCount - 1) + latency) / stats.successCount;
      stats.isHealthy = true;
    } else {
      stats.failureCount++;
      if (stats.failureCount > 5) {
        stats.isHealthy = false;
      }
    }
    stats.lastUsed = new Date();
  }

  private recordFailure(provider: AiProvider): void {
    const circuit = this.circuitBreakers.get(provider);
    if (!circuit) return;

    circuit.failures++;
    circuit.lastFailure = new Date();

    if (circuit.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      circuit.isOpen = true;
      logger.warn(`Circuit breaker opened for provider: ${provider}`);
    }
  }

  private resetCircuitBreaker(provider: AiProvider): void {
    const circuit = this.circuitBreakers.get(provider);
    if (!circuit) return;

    circuit.failures = 0;
    circuit.isOpen = false;
  }

  private isCircuitOpen(provider: AiProvider): boolean {
    const circuit = this.circuitBreakers.get(provider);
    if (!circuit || !circuit.isOpen) return false;

    // Auto-reset after timeout
    const elapsed = Date.now() - circuit.lastFailure.getTime();
    if (elapsed > this.CIRCUIT_BREAKER_TIMEOUT) {
      this.resetCircuitBreaker(provider);
      return false;
    }

    return true;
  }
}