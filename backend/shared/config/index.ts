import { z } from 'zod';
import { logger } from '../utils/logger';

// ==========================================
// INTERFACE
// ==========================================
export interface ServiceConfig {
  serviceName: string;
  port: number;
  nodeEnv: string;
  logLevel: string;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JwtConfig;
  firebase: FirebaseConfig;
  ai: AiConfig;
  cors: CorsConfig;
  rateLimit: RateLimitConfig;
  storage: StorageConfig;
  email: EmailConfig;
  sms: SmsConfig;
  payment: PaymentConfig;
  monitoring: MonitoringConfig;
  featureFlags: FeatureFlags;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
  minConnections: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  poolLogging: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix?: string;
  connectTimeout: number;
  maxRetriesPerRequest: number;
  enableReadyCheck: boolean;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
  issuer: string;
  audience: string;
}

export interface FirebaseConfig {
  projectId: string;
  clientEmail?: string;
  privateKey?: string;
  databaseURL?: string;
  storageBucket?: string;
}

export interface AiConfig {
  defaultProvider: string;
  gemini: { apiKey: string; model: string; embeddingModel: string; maxTokens: number; temperature: number };
  openai?: { apiKey: string; model: string; maxTokens: number; temperature: number };
  claude?: { apiKey: string; model: string; maxTokens: number; temperature: number };
  deepseek?: { apiKey: string; model: string; maxTokens: number; temperature: number };
  vectorDb: { provider: string; host: string; port: number; apiKey?: string; collectionName: string };
  embedding: { batchSize: number; maxRetries: number; retryDelay: number };
}

export interface CorsConfig {
  origins: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  maxAge: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  keyGenerator: 'ip' | 'tenant' | 'user' | 'combined';
  store: 'memory' | 'redis';
}

export interface StorageConfig {
  provider: 's3' | 'minio' | 'local';
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  publicUrl: string;
  maxFileSize: number;
  allowedMimeTypes: string[];
}

export interface EmailConfig {
  provider: 'smtp' | 'ses' | 'sendgrid';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  fromName: string;
  replyTo: string;
}

export interface SmsConfig {
  provider: 'twilio' | 'vonage' | 'viettel';
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  apiSecret?: string;
  from: string;
}

export interface PaymentConfig {
  providers: {
    vnpay?: { merchantId: string; secretKey: string; returnUrl: string; apiUrl: string };
    momo?: { partnerCode: string; accessKey: string; secretKey: string; returnUrl: string };
    stripe?: { secretKey: string; webhookSecret: string; publishableKey: string };
  };
  defaultProvider: string;
  currency: string;
}

export interface MonitoringConfig {
  enabled: boolean;
  provider: 'console' | 'datadog' | 'newrelic' | 'sentry';
  apiKey?: string;
  appId?: string;
  environment: string;
  sampleRate: number;
}

export interface FeatureFlags {
  enableMultiBranch: boolean;
  enableAiFeatures: boolean;
  enableMembership: boolean;
  enableLoyalty: boolean;
  enableMarketing: boolean;
  enableInventory: boolean;
  enableAnalytics: boolean;
  enableNotifications: boolean;
  enablePayment: boolean;
}

// ==========================================
// CONFIG VALIDATION SCHEMA
// ==========================================
const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.string().optional().default('3000'),
  SERVICE_NAME: z.string().default('spa-ecosystem'),

  // Database
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432'),
  DB_NAME: z.string().default('spa_ecosystem'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_SSL: z.string().default('false'),
  DB_MAX_CONNECTIONS: z.string().default('20'),
  DB_MIN_CONNECTIONS: z.string().default('2'),
  DB_IDLE_TIMEOUT: z.string().default('30000'),
  DB_CONNECTION_TIMEOUT: z.string().default('10000'),
  DB_POOL_LOGGING: z.string().default('false'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default('0'),
  REDIS_KEY_PREFIX: z.string().default('spa:'),
  REDIS_CONNECT_TIMEOUT: z.string().default('10000'),
  REDIS_MAX_RETRIES: z.string().default('3'),
  REDIS_READY_CHECK: z.string().default('true'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  JWT_ISSUER: z.string().default('spa-ecosystem'),
  JWT_AUDIENCE: z.string().default('spa-api'),

  // Firebase
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_DATABASE_URL: z.string().optional(),
  FIREBASE_STORAGE_BUCKET: z.string().optional(),

  // AI
  AI_DEFAULT_PROVIDER: z.enum(['gemini', 'openai', 'claude', 'deepseek']).default('gemini'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  GEMINI_MAX_TOKENS: z.string().default('4096'),
  GEMINI_TEMPERATURE: z.string().default('0.7'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_MAX_TOKENS: z.string().default('4096'),
  OPENAI_TEMPERATURE: z.string().default('0.7'),

  CLAUDE_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-20250514'),
  CLAUDE_MAX_TOKENS: z.string().default('4096'),
  CLAUDE_TEMPERATURE: z.string().default('0.7'),

  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
  DEEPSEEK_MAX_TOKENS: z.string().default('4096'),
  DEEPSEEK_TEMPERATURE: z.string().default('0.7'),

  VECTOR_DB_PROVIDER: z.string().default('qdrant'),
  VECTOR_DB_HOST: z.string().default('localhost'),
  VECTOR_DB_PORT: z.string().default('6333'),
  VECTOR_DB_API_KEY: z.string().optional(),
  VECTOR_DB_COLLECTION: z.string().default('spa-knowledge'),

  AI_EMBEDDING_BATCH_SIZE: z.string().default('100'),
  AI_EMBEDDING_MAX_RETRIES: z.string().default('3'),
  AI_EMBEDDING_RETRY_DELAY: z.string().default('1000'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  CORS_METHODS: z.string().default('GET,POST,PUT,DELETE,PATCH,OPTIONS'),
  CORS_ALLOWED_HEADERS: z.string().default('Content-Type,Authorization,X-Request-ID,X-Tenant-ID'),
  CORS_MAX_AGE: z.string().default('86400'),

  // Rate Limit
  RATE_LIMIT_WINDOW_MS: z.string().default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
  RATE_LIMIT_SKIP_SUCCESS: z.string().default('false'),
  RATE_LIMIT_KEY_GENERATOR: z.enum(['ip', 'tenant', 'user', 'combined']).default('combined'),
  RATE_LIMIT_STORE: z.enum(['memory', 'redis']).default('redis'),

  // Storage
  STORAGE_PROVIDER: z.enum(['s3', 'minio', 'local']).default('minio'),
  STORAGE_ENDPOINT: z.string().default('http://localhost:9000'),
  STORAGE_ACCESS_KEY: z.string().default('minioadmin'),
  STORAGE_SECRET_KEY: z.string().default('minioadmin'),
  STORAGE_BUCKET: z.string().default('spa-assets'),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_PUBLIC_URL: z.string().default('http://localhost:9000/spa-assets'),
  STORAGE_MAX_FILE_SIZE: z.string().default('10485760'),
  STORAGE_ALLOWED_MIME_TYPES: z.string().default('image/jpeg,image/png,image/gif,image/webp,application/pdf'),

  // Email
  EMAIL_PROVIDER: z.enum(['smtp', 'ses', 'sendgrid']).default('smtp'),
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.string().default('587'),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@spa-ecosystem.com'),
  EMAIL_FROM_NAME: z.string().default('Spa Ecosystem'),
  EMAIL_REPLY_TO: z.string().optional(),

  // SMS
  SMS_PROVIDER: z.enum(['twilio', 'vonage', 'viettel']).default('twilio'),
  SMS_ACCOUNT_SID: z.string().optional(),
  SMS_AUTH_TOKEN: z.string().optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_API_SECRET: z.string().optional(),
  SMS_FROM: z.string().default('SpaEco'),

  // Payment
  PAYMENT_DEFAULT_PROVIDER: z.string().default('vnpay'),
  PAYMENT_CURRENCY: z.string().default('VND'),

  VNPAY_MERCHANT_ID: z.string().optional(),
  VNPAY_SECRET_KEY: z.string().optional(),
  VNPAY_RETURN_URL: z.string().optional(),
  VNPAY_API_URL: z.string().default('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'),

  MOMO_PARTNER_CODE: z.string().optional(),
  MOMO_ACCESS_KEY: z.string().optional(),
  MOMO_SECRET_KEY: z.string().optional(),
  MOMO_RETURN_URL: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Monitoring
  MONITORING_ENABLED: z.string().default('false'),
  MONITORING_PROVIDER: z.enum(['console', 'datadog', 'newrelic', 'sentry']).default('console'),
  MONITORING_API_KEY: z.string().optional(),
  MONITORING_APP_ID: z.string().optional(),
  MONITORING_SAMPLE_RATE: z.string().default('1.0'),

  // Feature Flags
  FF_MULTI_BRANCH: z.string().default('true'),
  FF_AI_FEATURES: z.string().default('true'),
  FF_MEMBERSHIP: z.string().default('true'),
  FF_LOYALTY: z.string().default('true'),
  FF_MARKETING: z.string().default('true'),
  FF_INVENTORY: z.string().default('true'),
  FF_ANALYTICS: z.string().default('true'),
  FF_NOTIFICATIONS: z.string().default('true'),
  FF_PAYMENT: z.string().default('true'),
});

// ==========================================
// LOAD CONFIG (WITH VALIDATION)
// ==========================================
export function loadConfig(serviceName?: string, defaultPort?: number): ServiceConfig {
  const env = process.env;

  // Validate required environment variables
  const validated = ConfigSchema.safeParse(env);

  if (!validated.success) {
    logger.error('Invalid environment configuration', {
      errors: validated.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    });

    // In development, continue with defaults
    if (env.NODE_ENV !== 'production') {
      logger.warn('Using default config values for missing environment variables');
    } else {
      throw new Error('Invalid environment configuration. Please check your .env file.');
    }
  }

  const config = validated.success ? validated.data : (env as any);

  const port = defaultPort ? parseInt(env.PORT || String(defaultPort), 10) : parseInt(env.PORT || '3000', 10);

  return {
    serviceName: serviceName || env.SERVICE_NAME || 'spa-ecosystem',
    port,
    nodeEnv: config.NODE_ENV || 'development',
    logLevel: config.LOG_LEVEL || 'info',

    database: {
      host: config.DB_HOST || 'localhost',
      port: parseInt(config.DB_PORT || '5432', 10),
      database: config.DB_NAME || 'spa_ecosystem',
      user: config.DB_USER || 'postgres',
      password: config.DB_PASSWORD || 'postgres',
      ssl: config.DB_SSL === 'true',
      maxConnections: parseInt(config.DB_MAX_CONNECTIONS || '20', 10),
      minConnections: parseInt(config.DB_MIN_CONNECTIONS || '2', 10),
      idleTimeoutMillis: parseInt(config.DB_IDLE_TIMEOUT || '30000', 10),
      connectionTimeoutMillis: parseInt(config.DB_CONNECTION_TIMEOUT || '10000', 10),
      poolLogging: config.DB_POOL_LOGGING === 'true',
    },

    redis: {
      host: config.REDIS_HOST || 'localhost',
      port: parseInt(config.REDIS_PORT || '6379', 10),
      password: config.REDIS_PASSWORD || undefined,
      db: parseInt(config.REDIS_DB || '0', 10),
      keyPrefix: config.REDIS_KEY_PREFIX || 'spa:',
      connectTimeout: parseInt(config.REDIS_CONNECT_TIMEOUT || '10000', 10),
      maxRetriesPerRequest: parseInt(config.REDIS_MAX_RETRIES || '3', 10),
      enableReadyCheck: config.REDIS_READY_CHECK !== 'false',
    },

    jwt: {
      secret: config.JWT_SECRET || 'spa-ecosystem-jwt-secret-change-in-production',
      expiresIn: config.JWT_EXPIRES_IN || '24h',
      refreshExpiresIn: config.JWT_REFRESH_EXPIRES_IN || '30d',
      issuer: config.JWT_ISSUER || 'spa-ecosystem',
      audience: config.JWT_AUDIENCE || 'spa-api',
    },

    firebase: {
      projectId: config.FIREBASE_PROJECT_ID || '',
      clientEmail: config.FIREBASE_CLIENT_EMAIL,
      privateKey: config.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      databaseURL: config.FIREBASE_DATABASE_URL,
      storageBucket: config.FIREBASE_STORAGE_BUCKET,
    },

    ai: {
      defaultProvider: config.AI_DEFAULT_PROVIDER || 'gemini',
      gemini: {
        apiKey: config.GEMINI_API_KEY || '',
        model: config.GEMINI_MODEL || 'gemini-2.0-flash',
        embeddingModel: config.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
        maxTokens: parseInt(config.GEMINI_MAX_TOKENS || '4096', 10),
        temperature: parseFloat(config.GEMINI_TEMPERATURE || '0.7'),
      },
      openai: config.OPENAI_API_KEY
        ? {
            apiKey: config.OPENAI_API_KEY,
            model: config.OPENAI_MODEL || 'gpt-4o',
            maxTokens: parseInt(config.OPENAI_MAX_TOKENS || '4096', 10),
            temperature: parseFloat(config.OPENAI_TEMPERATURE || '0.7'),
          }
        : undefined,
      claude: config.CLAUDE_API_KEY
        ? {
            apiKey: config.CLAUDE_API_KEY,
            model: config.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
            maxTokens: parseInt(config.CLAUDE_MAX_TOKENS || '4096', 10),
            temperature: parseFloat(config.CLAUDE_TEMPERATURE || '0.7'),
          }
        : undefined,
      deepseek: config.DEEPSEEK_API_KEY
        ? {
            apiKey: config.DEEPSEEK_API_KEY,
            model: config.DEEPSEEK_MODEL || 'deepseek-chat',
            maxTokens: parseInt(config.DEEPSEEK_MAX_TOKENS || '4096', 10),
            temperature: parseFloat(config.DEEPSEEK_TEMPERATURE || '0.7'),
          }
        : undefined,
      vectorDb: {
        provider: config.VECTOR_DB_PROVIDER || 'qdrant',
        host: config.VECTOR_DB_HOST || 'localhost',
        port: parseInt(config.VECTOR_DB_PORT || '6333', 10),
        apiKey: config.VECTOR_DB_API_KEY,
        collectionName: config.VECTOR_DB_COLLECTION || 'spa-knowledge',
      },
      embedding: {
        batchSize: parseInt(config.AI_EMBEDDING_BATCH_SIZE || '100', 10),
        maxRetries: parseInt(config.AI_EMBEDDING_MAX_RETRIES || '3', 10),
        retryDelay: parseInt(config.AI_EMBEDDING_RETRY_DELAY || '1000', 10),
      },
    },

    cors: {
      origins: (config.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(',').map((s: string) => s.trim()),
      credentials: true,
      methods: (config.CORS_METHODS || 'GET,POST,PUT,DELETE,PATCH,OPTIONS').split(',').map((s: string) => s.trim()),
      allowedHeaders: (config.CORS_ALLOWED_HEADERS || 'Content-Type,Authorization,X-Request-ID,X-Tenant-ID').split(',').map((s: string) => s.trim()),
      exposedHeaders: ['X-Request-ID'],
      maxAge: parseInt(config.CORS_MAX_AGE || '86400', 10),
    },

    rateLimit: {
      windowMs: parseInt(config.RATE_LIMIT_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(config.RATE_LIMIT_MAX_REQUESTS || '100', 10),
      skipSuccessfulRequests: config.RATE_LIMIT_SKIP_SUCCESS === 'true',
      keyGenerator: config.RATE_LIMIT_KEY_GENERATOR || 'combined',
      store: config.RATE_LIMIT_STORE || 'redis',
    },

    storage: {
      provider: config.STORAGE_PROVIDER || 'minio',
      endpoint: config.STORAGE_ENDPOINT || 'http://localhost:9000',
      accessKey: config.STORAGE_ACCESS_KEY || 'minioadmin',
      secretKey: config.STORAGE_SECRET_KEY || 'minioadmin',
      bucket: config.STORAGE_BUCKET || 'spa-assets',
      region: config.STORAGE_REGION || 'us-east-1',
      publicUrl: config.STORAGE_PUBLIC_URL || 'http://localhost:9000/spa-assets',
      maxFileSize: parseInt(config.STORAGE_MAX_FILE_SIZE || '10485760', 10),
      allowedMimeTypes: (config.STORAGE_ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/gif,image/webp,application/pdf').split(','),
    },

    email: {
      provider: config.EMAIL_PROVIDER || 'smtp',
      host: config.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(config.SMTP_PORT || '587', 10),
      secure: config.SMTP_SECURE === 'true',
      user: config.SMTP_USER || '',
      password: config.SMTP_PASSWORD || '',
      from: config.EMAIL_FROM || 'noreply@spa-ecosystem.com',
      fromName: config.EMAIL_FROM_NAME || 'Spa Ecosystem',
      replyTo: config.EMAIL_REPLY_TO || config.EMAIL_FROM || 'noreply@spa-ecosystem.com',
    },

    sms: {
      provider: config.SMS_PROVIDER || 'twilio',
      accountSid: config.SMS_ACCOUNT_SID,
      authToken: config.SMS_AUTH_TOKEN,
      apiKey: config.SMS_API_KEY,
      apiSecret: config.SMS_API_SECRET,
      from: config.SMS_FROM || 'SpaEco',
    },

    payment: {
      providers: {
        vnpay: config.VNPAY_MERCHANT_ID && config.VNPAY_SECRET_KEY
          ? {
              merchantId: config.VNPAY_MERCHANT_ID,
              secretKey: config.VNPAY_SECRET_KEY,
              returnUrl: config.VNPAY_RETURN_URL || '',
              apiUrl: config.VNPAY_API_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
            }
          : undefined,
        momo: config.MOMO_PARTNER_CODE && config.MOMO_ACCESS_KEY && config.MOMO_SECRET_KEY
          ? {
              partnerCode: config.MOMO_PARTNER_CODE,
              accessKey: config.MOMO_ACCESS_KEY,
              secretKey: config.MOMO_SECRET_KEY,
              returnUrl: config.MOMO_RETURN_URL || '',
            }
          : undefined,
        stripe: config.STRIPE_SECRET_KEY
          ? {
              secretKey: config.STRIPE_SECRET_KEY,
              webhookSecret: config.STRIPE_WEBHOOK_SECRET || '',
              publishableKey: config.STRIPE_PUBLISHABLE_KEY || '',
            }
          : undefined,
      },
      defaultProvider: config.PAYMENT_DEFAULT_PROVIDER || 'vnpay',
      currency: config.PAYMENT_CURRENCY || 'VND',
    },

    monitoring: {
      enabled: config.MONITORING_ENABLED === 'true',
      provider: config.MONITORING_PROVIDER || 'console',
      apiKey: config.MONITORING_API_KEY,
      appId: config.MONITORING_APP_ID,
      environment: config.NODE_ENV || 'development',
      sampleRate: parseFloat(config.MONITORING_SAMPLE_RATE || '1.0'),
    },

    featureFlags: {
      enableMultiBranch: config.FF_MULTI_BRANCH !== 'false',
      enableAiFeatures: config.FF_AI_FEATURES !== 'false',
      enableMembership: config.FF_MEMBERSHIP !== 'false',
      enableLoyalty: config.FF_LOYALTY !== 'false',
      enableMarketing: config.FF_MARKETING !== 'false',
      enableInventory: config.FF_INVENTORY !== 'false',
      enableAnalytics: config.FF_ANALYTICS !== 'false',
      enableNotifications: config.FF_NOTIFICATIONS !== 'false',
      enablePayment: config.FF_PAYMENT !== 'false',
    },
  };
}

// ==========================================
// EXPORT DEFAULT
// ==========================================
export default {
  loadConfig,
  ConfigSchema,
};