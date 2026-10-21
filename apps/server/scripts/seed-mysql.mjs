/**
 * MySQL 开发种子：admin / designer + RBAC 角色。
 *
 * 只在本地/CI 明确允许时执行（NODE_ENV=production 需 LC_SEED_DEV_USERS=1）。
 * 口令散列与 src/common/password.ts 完全一致：scrypt:<salt_hex>:<hash_hex>。
 */
import { randomBytes, scryptSync } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const KEY_LEN = 64
const SALT_LEN = 16

function hashPassword(password) {
  const salt = randomBytes(SALT_LEN).toString('hex')
  const hash = scryptSync(password, salt, KEY_LEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

if (process.env.NODE_ENV === 'production' && process.env.LC_SEED_DEV_USERS !== '1') {
  console.error('拒绝在生产环境写入开发种子；如确需执行，设置 LC_SEED_DEV_USERS=1')
  process.exit(1)
}

const prisma = new PrismaClient()

const roles = [
  { key: 'admin', name: '平台管理员', perms: ['*'] },
  { key: 'designer', name: '设计器用户', perms: [] },
]

const users = [
  {
    id: 'u_admin',
    username: 'admin',
    displayName: '平台管理员',
    password: 'admin123',
    role: 'admin',
  },
  {
    id: 'u_designer',
    username: 'designer',
    displayName: '设计器用户',
    password: 'designer123',
    role: 'designer',
  },
]

try {
  await prisma.$transaction(async (tx) => {
    for (const role of roles) {
      const data = { name: role.name, perms: role.perms }
      await tx.role.upsert({
        where: { key: role.key },
        create: { key: role.key, ...data },
        update: data,
      })
    }

    for (const user of users) {
      await tx.user.upsert({
        where: { username: user.username },
        create: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          passwordHash: hashPassword(user.password),
          status: 'active',
        },
        update: { displayName: user.displayName, status: 'active' },
      })
      await tx.userRole.upsert({
        where: { userId_roleKey: { userId: user.id, roleKey: user.role } },
        create: { userId: user.id, roleKey: user.role },
        update: {},
      })
    }
  })
  console.log(`MySQL 种子完成：${users.map((user) => user.username).join(', ')}`)
} finally {
  await prisma.$disconnect()
}
