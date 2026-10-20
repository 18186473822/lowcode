/**
 * RBAC 配置的 JSON 文件仓储（批 6，D-P2-10）。
 *
 * - 落盘位置：`<DATA_DIR>/rbac.json`（单文件承载 roles + pages）；
 * - 写入采用「临时文件 + rename」原子替换（与 FileModelRepository 同款，防半截文件）；
 * - 文件不存在 → **种子配置**（admin 角色 `['*']` 通配 + designer 空角色；pages 空 = 全员可见，
 *   向后兼容 Phase 1）—— 种子保证 admin「超级角色」语义不依赖手工初始化。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable } from '@nestjs/common'
import { DATA_DIR } from '../common/tokens.js'
import type { RbacConfig, RbacRepository } from './rbac.types.js'

/** 首启种子：admin 通配超级角色 + designer 受限角色（与 UserStore 种子用户角色对齐） */
function seedConfig(): RbacConfig {
  return {
    roles: [
      { key: 'admin', name: '平台管理员', perms: ['*'] },
      { key: 'designer', name: '设计器用户', perms: [] },
    ],
    pages: {},
  }
}

@Injectable()
export class FileRbacRepository implements RbacRepository {
  private readonly file: string

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.file = path.join(dataDir, 'rbac.json')
  }

  async load(): Promise<RbacConfig> {
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<RbacConfig>
      // 容错：缺字段按空回退（配置由 UI 生成，但手改文件不应让服务崩）
      return {
        roles: Array.isArray(parsed.roles) ? parsed.roles : [],
        pages: parsed.pages && typeof parsed.pages === 'object' ? parsed.pages : {},
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return seedConfig()
      throw error // 文件损坏等异常原样上抛 → 500，不静默吞掉
    }
  }

  async save(config: RbacConfig): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(config, null, 2), 'utf8')
    await rename(tmp, this.file)
  }
}
