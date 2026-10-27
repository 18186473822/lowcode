/**
 * 物料市场清单签名（ES256 / P-256，IEEE P1363 r||s）。
 *
 * 与浏览器侧 `@lc/materials` 的 `verifyManifestSignature` 对齐：
 * - 签名原文是 `canonicalJson(manifest)`（对象键递归排序、数组保序、忽略 undefined）；
 * - Node `crypto.sign` 默认输出 DER，WebCrypto 需要 raw r||s，因此必须显式
 *   `dsaEncoding: 'ieee-p1363'`，否则客户端验签必然失败；
 * - 私钥只从 `LC_MATERIAL_MARKET_PRIVATE_KEY`（PKCS#8 PEM，可用 `\n` 表示换行）读取；
 *   生产未配置时市场清单接口返回 503，绝不在生产自动生成临时密钥；
 * - 非生产未配置时生成进程内临时密钥并告警，便于本地联调；公钥可通过
 *   `GET /materials/manifest/key` 获取后填入设计器。
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { Logger } from '@nestjs/common'
import type { MarketManifest, MarketManifestKey, SignedMarketManifest } from './market.types.js'

/** 与 `@lc/materials` 完全一致的稳定序列化；市场端签名必须复用同一实现。 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
  return `{${entries.join(',')}}`
}

/** 清单 ETag：内容哈希，同一份清单在任意副本/重启后保持一致。 */
export function manifestEtag(canonical: string): string {
  return `"market-manifest:${createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16)}"`
}

export interface MarketSigner {
  /** false = 生产未配置私钥，签名接口应 503 */
  enabled: boolean
  /** 未启用时的原因（用于日志/错误说明） */
  reason?: string
  /** 是否使用进程内临时密钥（仅非生产） */
  ephemeral: boolean
  publicKey?: string
  fingerprint?: string
  kid?: string
  /** 签名字节（raw r||s） */
  sign(data: string): Buffer
}

function fingerprintOf(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })
  return `sha256:${createHash('sha256').update(der).digest('hex')}`
}

function buildSigner(privateKeyPem: string, kid?: string): MarketSigner {
  const key = createPrivateKey({ key: privateKeyPem, format: 'pem' })
  if (key.asymmetricKeyType !== 'ec') {
    throw new Error('LC_MATERIAL_MARKET_PRIVATE_KEY 必须是 EC P-256 私钥')
  }
  const curve = key.asymmetricKeyDetails?.namedCurve
  if (curve !== 'prime256v1' && curve !== 'P-256') {
    throw new Error(`物料市场私钥必须是 P-256 曲线（当前：${String(curve)}）`)
  }
  const publicKey = createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString()
  const fingerprint = fingerprintOf(publicKey)
  return {
    enabled: true,
    ephemeral: false,
    publicKey,
    fingerprint,
    kid: kid?.trim() || fingerprint,
    sign: (data) => sign('sha256', Buffer.from(data, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }),
  }
}

/**
 * 解析签名配置。
 *
 * - `LC_MATERIAL_MARKET_PRIVATE_KEY`：PKCS#8 PEM；支持 `\n` 转义（便于 CI Secret 单行保存）；
 * - `LC_MATERIAL_MARKET_KID`：可选密钥标识，缺省用公钥指纹；
 * - 生产未配置 → `enabled: false`（不抛错，市场功能可选）；
 * - 显式配置但格式/曲线非法 → 抛错（启动失败，避免带病发布无法验签的清单）。
 */
export function loadMarketSigner(env: NodeJS.ProcessEnv = process.env): MarketSigner {
  const raw = env.LC_MATERIAL_MARKET_PRIVATE_KEY?.trim()
  if (raw) {
    const pem = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
    return buildSigner(pem, env.LC_MATERIAL_MARKET_KID)
  }

  if (env.NODE_ENV === 'production') {
    return {
      enabled: false,
      ephemeral: false,
      reason: 'LC_MATERIAL_MARKET_PRIVATE_KEY 未配置，生产环境不生成临时签名密钥',
      sign: () => {
        throw new Error('物料市场签名密钥未配置')
      },
    }
  }

  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const signer = buildSigner(pem, env.LC_MATERIAL_MARKET_KID)
  signer.ephemeral = true
  new Logger('MaterialMarket').warn(
    'LC_MATERIAL_MARKET_PRIVATE_KEY 未配置，已生成进程内临时 ES256 密钥；仅用于本地联调，重启后公钥会变化',
  )
  return signer
}

/** 对清单签名，返回与客户端约定一致的信封。 */
export function signManifest(manifest: MarketManifest, signer: MarketSigner): SignedMarketManifest {
  if (!signer.enabled) throw new Error(signer.reason ?? '物料市场签名未启用')
  const signature = signer.sign(canonicalJson(manifest))
  return { alg: 'ES256', signature: signature.toString('base64'), manifest }
}

/** 公钥信息（公钥不是秘密，可公开获取用于验签）。 */
export function manifestKey(signer: MarketSigner): MarketManifestKey {
  if (!signer.enabled || !signer.publicKey || !signer.fingerprint || !signer.kid) {
    throw new Error(signer.reason ?? '物料市场签名未启用')
  }
  return {
    alg: 'ES256',
    publicKey: signer.publicKey,
    fingerprint: signer.fingerprint,
    kid: signer.kid,
  }
}
