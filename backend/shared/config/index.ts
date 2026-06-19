export interface ServiceConfig {
  serviceName: string;
  port: number;
  nodeEnv: string;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JwtConfig;
  firebase: FirebaseConfig;
  ai: AiConfig;
  cors: CorsConfig;
  rateLimit: RateLimitConfig;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export interface FirebaseConfig {
  projectId: string;
  clientEmail?: string;
  privateKey?: string;
}

export interface AiConfig {
  defaultProvider: string;
  gemini: { apiKey: string; model: string; embeddingModel: string };
  openai?: { apiKey: string; model: string };
  claude?: { apiKey: string; model: string };
  deepseek?: { apiKey: string; model: string };
  vectorDb: { provider: string; host: string; port: number; apiKey?: string };
}

export interface CorsConfig {
  origins: string[];
  credentials: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export function loadConfig(serviceName: string, defaultPort: number): ServiceConfig {
  return {
    serviceName,
    port: parseInt(process.env.PORT || String(defaultPort), 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'spa_ecosystem',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      ssl: process.env.DB_SSL === 'true',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'spa-ecosystem-jwt-secret-change-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    },
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    ai: {
      defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'gemini',
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
      },
      openai: process.env.OPENAI_API_KEY
        ? { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4o' }
        : undefined,
      claude: process.env.CLAUDE_API_KEY
        ? { apiKey: process.env.CLAUDE_API_KEY, model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514' }
        : undefined,
      deepseek: process.env.DEEPSEEK_API_KEY
        ? { apiKey: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' }
        : undefined,
      vectorDb: {
        provider: process.env.VECTOR_DB_PROVIDER || 'qdrant',
        host: process.env.VECTOR_DB_HOST || 'localhost',
        port: parseInt(process.env.VECTOR_DB_PORT || '6333', 10),
        apiKey: process.env.VECTOR_DB_API_KEY,
      },
    },
    cors: {
      origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
      credentials: true,
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
  };
}
