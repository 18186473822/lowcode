/**
 * 口令散列（scrypt，Node 内置，零第三方依赖）。
 *
 * 存储格式：`scrypt:<salt_hex>:<hash_hex>`，校验使用 timingSafeEqual 防时序侧信道。
 * 骨架阶段固定参数（64 字节 / 16 字节盐）；如需抗 GPU 可调大 cost 并升级格式版本。
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LEN = 64
const SALT_LEN = 16
const SCHEME = 'scrypt'

/** 生成口令散列（每次调用盐不同） */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN).toString('hex')
  const hash = scryptSync(password, salt, KEY_LEN).toString('hex')
  return `${SCHEME}:${salt}:${hash}`
}

/** 校验口令；散列格式非法或不匹配均返回 false */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = String(stored).split(':')
  if (scheme !== SCHEME || !salt || !hash) return false

  const expected = Buffer.from(hash, 'hex')
  if (expected.length !== KEY_LEN) return false

  const actual = scryptSync(password, salt, KEY_LEN)
  return timingSafeEqual(actual, expected)
}
