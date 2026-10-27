/**
 * market.json → MySQL 三表导入验证（CI / 本地，要求 *_test 库）。
 *
 * 验证步骤：
 *   1. 清理 `demo-*` 市场数据；
 *   2. 用测试 fixture 执行一次 `import:json-to-mysql`；
 *   3. Prisma 回读三表，与 fixture 逐字段深比较；
 *   4. 再执行一次导入，比较两次快照必须完全一致（幂等）；
 *   5. finally 清理 `demo-*`，不污染测试库。
 *
 * 用法：
 *   LC_SMOKE_DATABASE_URL=mysql://.../lowcode_test node apps/server/scripts/verify-market-import.mjs
 */
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const serverDir = path.resolve(scriptDir, '..')
const fixtureDir = path.join(serverDir, 'test/fixtures/market-import')
const databaseUrl =
  process.env.LC_SMOKE_DATABASE_URL ?? process.env.LC_TEST_DATABASE_URL ?? process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('缺少 LC_SMOKE_DATABASE_URL / LC_TEST_DATABASE_URL / DATABASE_URL')
  process.exit(1)
}

const dbName = new URL(databaseUrl).pathname.replace(/^\//, '')
if (!dbName.endsWith('_test')) {
  console.error(`拒绝在非测试库执行导入验证：${dbName}（库名必须以 _test 结尾）`)
  process.exit(1)
}

const fixture = JSON.parse(await readFile(path.join(fixtureDir, 'market.json'), 'utf8'))
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAILED: ${message}`)
}

const iso = (value) => (value ? value.toISOString() : null)
const by = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0)
const byPair = (a, b) =>
  `${a.materialId}@${a.version}`.localeCompare(`${b.materialId}@${b.version}`)
const byInstall = (a, b) =>
  `${a.tenantId}/${a.materialId}`.localeCompare(`${b.tenantId}/${b.materialId}`)

function expectedMaterials() {
  return fixture.materials
    .map((item) => ({
      id: item.id,
      status: item.status,
      version: item.version,
      name: item.name,
      description: item.description ?? null,
      category: item.category,
      kind: item.kind,
      component: item.component ?? null,
      metaJson: item.meta,
      revision: item.revision,
      createdBy: item.createdBy,
      updatedBy: item.updatedBy,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      submittedAt: item.submittedAt ?? null,
      reviewedAt: item.reviewedAt ?? null,
      reviewedBy: item.reviewedBy ?? null,
      reviewDecision: item.reviewDecision ?? null,
      reviewNote: item.reviewNote ?? null,
      publishedAt: item.publishedAt ?? null,
      publishedBy: item.publishedBy ?? null,
      publishedVersion: item.publishedVersion ?? null,
    }))
    .sort(by('id'))
}

function expectedVersions() {
  return fixture.versions
    .map((item) => ({
      materialId: item.materialId,
      version: item.version,
      entryJson: item.entry,
      note: item.note ?? null,
      publishedBy: item.publishedBy,
      publishedAt: item.publishedAt,
    }))
    .sort(byPair)
}

function expectedInstalls() {
  return fixture.installs
    .map((item) => ({
      tenantId: item.tenantId,
      materialId: item.materialId,
      version: item.version,
      installedBy: item.installedBy,
      installedAt: item.installedAt,
      updatedAt: item.updatedAt,
      revision: item.revision,
    }))
    .sort(byInstall)
}

async function snapshot() {
  const [materials, versions, installs] = await Promise.all([
    prisma.marketMaterial.findMany({ where: { id: { startsWith: 'demo-' } } }),
    prisma.marketMaterialVersion.findMany({
      where: { materialId: { startsWith: 'demo-' } },
    }),
    prisma.marketInstall.findMany({ where: { materialId: { startsWith: 'demo-' } } }),
  ])
  return {
    materials: materials
      .map((row) => ({
        id: row.id,
        status: row.status,
        version: row.version,
        name: row.name,
        description: row.description,
        category: row.category,
        kind: row.kind,
        component: row.component,
        metaJson: row.metaJson,
        revision: row.revision,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        submittedAt: iso(row.submittedAt),
        reviewedAt: iso(row.reviewedAt),
        reviewedBy: row.reviewedBy,
        reviewDecision: row.reviewDecision,
        reviewNote: row.reviewNote,
        publishedAt: iso(row.publishedAt),
        publishedBy: row.publishedBy,
        publishedVersion: row.publishedVersion,
      }))
      .sort(by('id')),
    versions: versions
      .map((row) => ({
        materialId: row.materialId,
        version: row.version,
        entryJson: row.entryJson,
        note: row.note,
        publishedBy: row.publishedBy,
        publishedAt: iso(row.publishedAt),
      }))
      .sort(byPair),
    installs: installs
      .map((row) => ({
        tenantId: row.tenantId,
        materialId: row.materialId,
        version: row.version,
        installedBy: row.installedBy,
        installedAt: iso(row.installedAt),
        updatedAt: iso(row.updatedAt),
        revision: row.revision,
      }))
      .sort(byInstall),
  }
}

function runImport() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/import-json-to-mysql.mjs'], {
      cwd: serverDir,
      env: { ...process.env, DATABASE_URL: databaseUrl, LC_DATA_DIR: fixtureDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('导入超时（60s）'))
    }, 60_000)
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`导入退出码 ${code}：\n${output}`))
    })
  })
}

async function clean() {
  await prisma.marketInstall.deleteMany({ where: { materialId: { startsWith: 'demo-' } } })
  await prisma.marketMaterialVersion.deleteMany({
    where: { materialId: { startsWith: 'demo-' } },
  })
  await prisma.marketMaterial.deleteMany({ where: { id: { startsWith: 'demo-' } } })
}

try {
  await clean()

  const firstLog = await runImport()
  assert(
    firstLog.includes('marketMaterials=3, marketVersions=3, marketInstalls=3'),
    `首次导入计数不符：\n${firstLog}`,
  )
  const first = await snapshot()
  assert(first.materials.length === 3, `materials=${first.materials.length}`)
  assert(first.versions.length === 3, `versions=${first.versions.length}`)
  assert(first.installs.length === 3, `installs=${first.installs.length}`)
  assert(
    isDeepStrictEqual(first.materials, expectedMaterials()),
    `物料行与 fixture 不一致：\nactual=${JSON.stringify(first.materials)}\nexpected=${JSON.stringify(expectedMaterials())}`,
  )
  assert(
    isDeepStrictEqual(first.versions, expectedVersions()),
    `版本行与 fixture 不一致：\nactual=${JSON.stringify(first.versions)}\nexpected=${JSON.stringify(expectedVersions())}`,
  )
  assert(
    isDeepStrictEqual(first.installs, expectedInstalls()),
    `安装行与 fixture 不一致：\nactual=${JSON.stringify(first.installs)}\nexpected=${JSON.stringify(expectedInstalls())}`,
  )

  const secondLog = await runImport()
  assert(
    secondLog.includes('marketMaterials=3, marketVersions=3, marketInstalls=3'),
    `第二次导入计数不符：\n${secondLog}`,
  )
  const second = await snapshot()
  assert(isDeepStrictEqual(second, first), '第二次导入改变了行内容：不是幂等 upsert')

  console.log('PASS market.json → MySQL 三表 3/3/3')
  console.log('PASS 两次导入快照完全一致（幂等）')
} finally {
  await clean()
  await prisma.$disconnect()
}
