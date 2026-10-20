/**
 * 文件上传端到端集成测试（真实启动 Nest 应用，临时目录落盘）：
 * multipart 上传 / 公开读取 / 鉴权 / 空文件 / 超限 413 / fileId 路径穿越拦截。
 */
import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module.js'

let app: INestApplication
let base: string
let dataDir: string
let token: string

/** 1×1 透明 PNG */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function login(): Promise<string> {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  const body = (await res.json()) as { accessToken: string }
  return body.accessToken
}

/** multipart 上传（不手动设 content-type，交给 fetch 生成 boundary） */
async function upload(file: { name: string; type: string; bytes: Buffer }, withToken = true) {
  const fd = new FormData()
  fd.append('file', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name)
  const res = await fetch(`${base}/api/v1/files/upload`, {
    method: 'POST',
    headers: withToken ? { authorization: `Bearer ${token}` } : {},
    body: fd,
  })
  let body: any = null
  try {
    body = await res.json()
  } catch {
    /* 非 JSON（理论上不会出现） */
  }
  return { status: res.status, body }
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'lc-file-test-'))
  process.env.LC_DATA_DIR = dataDir
  process.env.LC_JWT_SECRET = 'test-secret'

  app = await NestFactory.create(AppModule, { logger: false })
  app.setGlobalPrefix('api/v1')
  // 显式绑 127.0.0.1：listen(0) 默认绑 ::，app.getUrl() 会返回 http://[::1]:port ——
  // 本机 IPv6 回环被拦（EACCES）时测试全红（教训 B-29）
  await app.listen(0, '127.0.0.1')
  base = await app.getUrl()

  token = await login()
  expect(token).toBeTruthy()
})

afterAll(async () => {
  await app?.close()
  await rm(dataDir, { recursive: true, force: true })
})

describe('文件上传', () => {
  it('未登录上传 → 401', async () => {
    const r = await upload({ name: 'a.png', type: 'image/png', bytes: PNG_1X1 }, false)
    expect(r.status).toBe(401)
  })

  it('上传 PNG：返回 fileId（含扩展名）/ url / 元信息', async () => {
    const r = await upload({ name: '头像.png', type: 'image/png', bytes: PNG_1X1 })
    expect(r.status).toBe(200)
    expect(r.body.fileId).toMatch(/^[0-9a-f-]+\.png$/)
    expect(r.body.url).toBe(`/api/v1/files/${r.body.fileId}`)
    expect(r.body.name).toBe('头像.png')
    expect(r.body.size).toBe(PNG_1X1.length)
    expect(r.body.mimeType).toBe('image/png')

    // 公开读取（无需令牌）：字节一致 + content-type 正确
    const res = await fetch(`${base}${r.body.url}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.equals(PNG_1X1)).toBe(true)
  })

  it('伪造路径的文件名只保留 basename，扩展名白名单外不拼进 fileId', async () => {
    const evil = await upload({ name: '../../../evil.PNG', type: 'image/png', bytes: PNG_1X1 })
    expect(evil.body.name).toBe('evil.PNG')
    expect(evil.body.fileId.endsWith('.png')).toBe(true) // 白名单匹配并转小写

    const noExt = await upload({ name: 'data', type: 'application/json', bytes: Buffer.from('{}') })
    expect(noExt.body.fileId).not.toContain('.') // uuid 无点，扩展名被拒
    const res = await fetch(`${base}${noExt.body.url}`)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('无文件字段 → 400 INVALID_REQUEST；空文件 → 400', async () => {
    const empty = new FormData()
    const noFile = await fetch(`${base}/api/v1/files/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: empty,
    })
    expect(noFile.status).toBe(400)
    expect((await noFile.json()).code).toBe('INVALID_REQUEST')

    const zero = await upload({ name: 'zero.bin', type: 'application/octet-stream', bytes: Buffer.alloc(0) })
    expect(zero.status).toBe(400)
  })

  it('超过 10MB → 413（multer LIMIT_FILE_SIZE）', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 7)
    const r = await upload({ name: 'big.bin', type: 'application/octet-stream', bytes: big })
    expect(r.status).toBe(413)
  })

  it('读取不存在 / 非法 fileId → 404 FILE_NOT_FOUND（含路径穿越尝试）', async () => {
    const ghost = await fetch(`${base}/api/v1/files/nope.png`)
    expect(ghost.status).toBe(404)
    expect((await ghost.json()).code).toBe('FILE_NOT_FOUND')

    const traversal = await fetch(`${base}/api/v1/files/a%2F..%2Fsecret`)
    expect(traversal.status).toBe(404)
    expect((await traversal.json()).code).toBe('FILE_NOT_FOUND')
  })

  it('元信息缺失时 mime 降级 octet-stream；元信息损坏 → 500（不静默）', async () => {
    const up = await upload({ name: 'z.bin', type: 'text/custom-xyz', bytes: Buffer.from('zz') })
    expect(up.status).toBe(200)
    await rm(path.join(dataDir, 'files-meta', `${up.body.fileId}.json`))
    const degraded = await fetch(`${base}${up.body.url}`)
    expect(degraded.status).toBe(200)
    expect(degraded.headers.get('content-type')).toContain('application/octet-stream')

    const up2 = await upload({ name: 'y.bin', type: 'application/octet-stream', bytes: Buffer.from('yy') })
    await writeFile(path.join(dataDir, 'files-meta', `${up2.body.fileId}.json`), '{oops', 'utf8')
    const broken = await fetch(`${base}${up2.body.url}`)
    expect(broken.status).toBe(500)
  })
})
