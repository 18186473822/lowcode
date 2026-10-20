/** 口令散列单元测试（scrypt + timingSafeEqual） */
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/common/password.js'

describe('password', () => {
  it('散列往返校验通过', () => {
    expect(verifyPassword('admin123', hashPassword('admin123'))).toBe(true)
  })

  it('口令不匹配返回 false', () => {
    expect(verifyPassword('wrong', hashPassword('admin123'))).toBe(false)
  })

  it('每次散列盐不同（同口令不同散列）', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })

  it('散列格式非法一律返回 false（不抛错）', () => {
    expect(verifyPassword('x', 'plaintext')).toBe(false)
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', 'scrypt:short:zz')).toBe(false)
    expect(verifyPassword('x', 'md5:abc:def')).toBe(false)
  })
})
