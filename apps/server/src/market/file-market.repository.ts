/**
 * 物料市场 JSON 文件仓储（`LC_STORAGE=json`，默认/测试路径）。
 *
 * 文件布局：`<DATA_DIR>/market.json`
 * ```json
 * { "materials": [], "versions": [], "installs": [] }
 * ```
 *
 * 单文件承载三类数据，所有写操作共用一把 `KeyedLock`，保证「读 → 判 revision →
 * 写版本快照 → 写物料」在单进程内原子完成；写入采用临时文件 + rename。
 * JSON 多实例部署不在支持范围（与其它文件仓储同一口径）。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { DATA_DIR } from '../common/tokens.js'
import { KeyedLock } from '../common/keyed-lock.js'
import type {
  MarketInstall,
  MarketMaterial,
  MarketMaterialVersion,
  MarketPublishResult,
  MarketRepository,
} from './market.types.js'

interface MarketFile {
  materials: MarketMaterial[]
  versions: MarketMaterialVersion[]
  installs: MarketInstall[]
}

const EMPTY: MarketFile = { materials: [], versions: [], installs: [] }

@Injectable()
export class FileMarketRepository implements MarketRepository {
  private readonly file: string
  private readonly lock = new KeyedLock()

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.file = path.join(dataDir, 'market.json')
  }

  private async read(): Promise<MarketFile> {
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<MarketFile>
      return {
        materials: Array.isArray(parsed.materials) ? parsed.materials : [],
        versions: Array.isArray(parsed.versions) ? parsed.versions : [],
        installs: Array.isArray(parsed.installs) ? parsed.installs : [],
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY }
      throw error
    }
  }

  private async write(data: MarketFile): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await rename(tmp, this.file)
  }

  async listMaterials(): Promise<MarketMaterial[]> {
    return (await this.read()).materials
  }

  async findMaterial(id: string): Promise<MarketMaterial | null> {
    return (await this.read()).materials.find((item) => item.id === id) ?? null
  }

  async createMaterial(material: MarketMaterial): Promise<boolean> {
    return this.lock.runExclusive('market', async () => {
      const data = await this.read()
      if (data.materials.some((item) => item.id === material.id)) return false
      data.materials.push(material)
      await this.write(data)
      return true
    })
  }

  async updateMaterial(material: MarketMaterial, expectedRevision: number): Promise<boolean> {
    return this.lock.runExclusive('market', async () => {
      const data = await this.read()
      const index = data.materials.findIndex((item) => item.id === material.id)
      if (index < 0 || data.materials[index].revision !== expectedRevision) return false
      data.materials[index] = material
      await this.write(data)
      return true
    })
  }

  async publishMaterial(
    material: MarketMaterial,
    version: MarketMaterialVersion,
    expectedRevision: number,
  ): Promise<MarketPublishResult> {
    return this.lock.runExclusive('market', async () => {
      const data = await this.read()
      const index = data.materials.findIndex((item) => item.id === material.id)
      if (index < 0 || data.materials[index].revision !== expectedRevision) return 'conflict'
      if (
        data.versions.some(
          (item) => item.materialId === version.materialId && item.version === version.version,
        )
      ) {
        return 'version-exists'
      }
      data.versions.push(version)
      data.materials[index] = material
      await this.write(data)
      return 'ok'
    })
  }

  async listVersions(materialId: string): Promise<MarketMaterialVersion[]> {
    return (await this.read()).versions.filter((item) => item.materialId === materialId)
  }

  async findVersion(materialId: string, version: string): Promise<MarketMaterialVersion | null> {
    return (
      (await this.read()).versions.find(
        (item) => item.materialId === materialId && item.version === version,
      ) ?? null
    )
  }

  async listInstalls(tenantId: string): Promise<MarketInstall[]> {
    return (await this.read()).installs.filter((item) => item.tenantId === tenantId)
  }

  async findInstall(tenantId: string, materialId: string): Promise<MarketInstall | null> {
    return (
      (await this.read()).installs.find(
        (item) => item.tenantId === tenantId && item.materialId === materialId,
      ) ?? null
    )
  }

  async createInstall(install: MarketInstall): Promise<boolean> {
    return this.lock.runExclusive('market', async () => {
      const data = await this.read()
      const exists = data.installs.some(
        (item) => item.tenantId === install.tenantId && item.materialId === install.materialId,
      )
      if (exists) return false
      data.installs.push(install)
      await this.write(data)
      return true
    })
  }

  async updateInstall(install: MarketInstall, expectedRevision: number): Promise<boolean> {
    return this.lock.runExclusive('market', async () => {
      const data = await this.read()
      const index = data.installs.findIndex(
        (item) => item.tenantId === install.tenantId && item.materialId === install.materialId,
      )
      if (index < 0 || data.installs[index].revision !== expectedRevision) return false
      data.installs[index] = install
      await this.write(data)
      return true
    })
  }

  async removeInstall(tenantId: string, materialId: string, expectedRevision: number): Promise<boolean> {
    return this.lock.runExclusive('market', async () => {
      const data = await this.read()
      const index = data.installs.findIndex(
        (item) => item.tenantId === tenantId && item.materialId === materialId,
      )
      if (index < 0 || data.installs[index].revision !== expectedRevision) return false
      data.installs.splice(index, 1)
      await this.write(data)
      return true
    })
  }
}
