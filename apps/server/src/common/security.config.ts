/**
 * 生产安全配置解析（JWT / CORS / 限流）。
 *
 * 原则：
 * - **生产 fail-closed**：`NODE_ENV=production` 时没有 `LC_JWT_SECRET` 直接拒绝启动；
 * - **开发可用**：未设置密钥时使用仓库内置默认值（会打印警告），不阻塞本地调试；
 * - **非法配置启动即失败**：密钥过短、CORS 通配符、限流参数非正整数都抛错，避免带病运行。
 *
 * 注意：服务端不自动加载 `.env`，环境变量需在启动进程前注入。
 */
/** 仓库内置开发密钥：只允许「未显式配置」时回退，生产环境禁止使用。 */
export const DEV_JWT_SECRET = 'dev-insecure-secret-please-set-LC_JWT_SECRET'

/** 生产密钥最小长度（字符数）。 */
export const MIN_JWT_SECRET_LENGTH = 32

/** 本地开发默认放行的设计器 / H5 源（仅非 production 生效）。 */
export const DEV_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
] as const

export interface JwtSecretResolution {
  secret: string
  /** true = 使用了内置开发密钥，生产环境不会走到这里 */
  insecure: boolean
}

/**
 * 解析 JWT 密钥。
 *
 * - 显式配置：必须 ≥32 字符，且不能等于仓库内置开发密钥；
 * - 未配置：production 抛错；其他环境回退开发密钥并标记 insecure。
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): JwtSecretResolution {
  const configured = env.LC_JWT_SECRET?.trim()

  if (configured) {
    if (configured === DEV_JWT_SECRET) {
      throw new Error('LC_JWT_SECRET 不能使用仓库内置的开发默认值，请生成独立密钥')
    }
    if (configured.length < MIN_JWT_SECRET_LENGTH) {
      throw new Error(
        `LC_JWT_SECRET 至少需要 ${MIN_JWT_SECRET_LENGTH} 个字符（当前 ${configured.length} 个）`,
      )
    }
    return { secret: configured, insecure: false }
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(`生产环境必须设置 LC_JWT_SECRET（至少 ${MIN_JWT_SECRET_LENGTH} 个字符）`)
  }

  return { secret: DEV_JWT_SECRET, insecure: true }
}

/**
 * 解析 CORS 白名单。
 *
 * - 显式配置：逗号分隔的完整源（协议 + 主机 + 可选端口），拒绝 `*`、路径、查询串；
 * - 未配置：production 返回空数组（不发送 CORS 允许头，同源部署不受影响）；
 * - 未配置：开发环境放行 Vite 设计器 / H5 的 localhost 源。
 */
export function resolveCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.LC_CORS_ORIGINS?.trim()
  if (!raw) {
    return env.NODE_ENV === 'production' ? [] : [...DEV_CORS_ORIGINS]
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const origins: string[] = []
  for (const value of values) {
    if (value === '*') {
      throw new Error('LC_CORS_ORIGINS 不允许通配符 *，请显式列出允许的源')
    }

    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error(`LC_CORS_ORIGINS 含非法源：${value}`)
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`LC_CORS_ORIGINS 只支持 http/https 源：${value}`)
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error(`LC_CORS_ORIGINS 只接受源（origin），不能带路径/查询/凭据：${value}`)
    }

    origins.push(url.origin)
  }

  return [...new Set(origins)]
}

export interface CorsConfig {
  origin: string[] | false
  credentials: boolean
  methods: string[]
  allowedHeaders: string[]
  /** 浏览器跨域默认读不到 ETag/限流头，需显式暴露给设计器管理面。 */
  exposedHeaders: string[]
  maxAge: number
}

/** 生成 Nest `enableCors()` 所需配置；白名单为空时关闭跨域响应头。 */
export function buildCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsConfig {
  const origins = resolveCorsOrigins(env)
  return {
    origin: origins.length > 0 ? origins : false,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'If-Match', 'X-LC-Tenant'],
    exposedHeaders: [
      'ETag',
      'X-Request-Id',
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    maxAge: 600,
  }
}

export interface RateLimitConfig {
  /** 统计窗口（毫秒） */
  windowMs: number
  /** 普通接口每 IP 每窗口请求上限 */
  max: number
  /** 登录接口每 IP 每窗口请求上限（防口令爆破） */
  loginMax: number
  /** 是否信任反向代理的 X-Forwarded-For（由 Express trust proxy 控制） */
  trustProxy: boolean
}

function readPositiveInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  max = 1_000_000,
): number {
  const raw = env[key]?.trim()
  if (!raw) return fallback
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${key} 必须是正整数（当前：${raw}）`)
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${key} 必须在 1..${max} 之间（当前：${raw}）`)
  }
  return value
}

function readBoolean(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = env[key]?.trim().toLowerCase()
  if (!raw || ['0', 'false', 'no', 'off'].includes(raw)) return false
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  throw new Error(`${key} 只接受 true/false/1/0/yes/no/on/off（当前：${raw}）`)
}

/**
 * 解析限流参数。
 *
 * 默认：普通接口 600 次/分钟/IP，登录 20 次/分钟/IP。
 * 单进程内存计数，适合当前单实例；多实例部署需换 Redis 等共享存储。
 */
export function resolveRateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  return {
    windowMs: readPositiveInt(env, 'LC_RATE_LIMIT_WINDOW_MS', 60_000, 86_400_000),
    max: readPositiveInt(env, 'LC_RATE_LIMIT_MAX', 600),
    loginMax: readPositiveInt(env, 'LC_LOGIN_RATE_LIMIT_MAX', 20),
    trustProxy: readBoolean(env, 'LC_TRUST_PROXY'),
  }
}

/**
 * 启动期安全自检：任何非法配置都在监听端口前失败。
 * 返回限流配置，供 `main.ts` 复用（trust proxy 设置）。
 */
export function assertSecurityConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  resolveJwtSecret(env)
  resolveCorsOrigins(env)
  return resolveRateLimitConfig(env)
}
