/**
 * 物料市场 MySQL 仓储（Phase 4 开放集成第三批）。
 *
 * 与 JSON 实现字段形状一致；物料写操作使用 `revision` CAS（`updateMany`），
 * 发布在事务内完成「CAS + 版本快照」，版本主键冲突（P2002）映射为 `version-exists`。
 * 安装记录以 `(tenantId, materialId)` 复合主键，创建冲突返回 false。
 */
import { Inject, Injectable } from '@nestjs/common'
import { Prisma, type PrismaClient } from '@prisma/client'
import { PRISMA_SERVICE } from '../prisma.service.js'
import type { MaterialSchema } from '@lc/schema'
import type {
  MarketInstall,
  MarketMaterial,
  MarketMaterialVersion,
  MarketPublishResult,
  MarketRepository,
} from '../../market/market.types.js'

function iso(value: Date): string {
  return value.toISOString()
}

function date(value: string | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function requiredDate(value: string): Date {
  return date(value) ?? new Date()
}

function meta(value: Prisma.JsonValue): MaterialSchema {
  return value as unknown as MaterialSchema
}

@Injectable()
export class MysqlMarketRepository implements MarketRepository {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  async listMaterials(): Promise<MarketMaterial[]> {
    const rows = await this.prisma.marketMaterial.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    })
    return rows.map((row) => this.mapMaterial(row))
  }

  async findMaterial(id: string): Promise<MarketMaterial | null> {
    const row = await this.prisma.marketMaterial.findUnique({ where: { id } })
    return row ? this.mapMaterial(row) : null
  }

  async createMaterial(material: MarketMaterial): Promise<boolean> {
    try {
      await this.prisma.marketMaterial.create({
        data: { id: material.id, ...this.materialData(material) },
      })
      return true
    } catch (error) {
      if (this.isUniqueViolation(error)) return false
      throw error
    }
  }

  async updateMaterial(material: MarketMaterial, expectedRevision: number): Promise<boolean> {
    const result = await this.prisma.marketMaterial.updateMany({
      where: { id: material.id, revision: expectedRevision },
      data: this.materialData(material),
    })
    return result.count === 1
  }

  async publishMaterial(
    material: MarketMaterial,
    version: MarketMaterialVersion,
    expectedRevision: number,
  ): Promise<MarketPublishResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.marketMaterial.updateMany({
          where: { id: material.id, revision: expectedRevision },
          data: this.materialData(material),
        })
        if (updated.count !== 1) return 'conflict'
        await tx.marketMaterialVersion.create({
          data: {
            materialId: version.materialId,
            version: version.version,
            entryJson: version.entry as unknown as Prisma.InputJsonValue,
            note: version.note ?? null,
            publishedBy: version.publishedBy,
            publishedAt: requiredDate(version.publishedAt),
          },
        })
        return 'ok'
      })
    } catch (error) {
      if (this.isUniqueViolation(error)) return 'version-exists'
      throw error
    }
  }

  async listVersions(materialId: string): Promise<MarketMaterialVersion[]> {
    const rows = await this.prisma.marketMaterialVersion.findMany({
      where: { materialId },
      orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
    })
    return rows.map((row) => this.mapVersion(row))
  }

  async findVersion(materialId: string, version: string): Promise<MarketMaterialVersion | null> {
    const row = await this.prisma.marketMaterialVersion.findUnique({
      where: { materialId_version: { materialId, version } },
    })
    return row ? this.mapVersion(row) : null
  }

  async listInstalls(tenantId: string): Promise<MarketInstall[]> {
    const rows = await this.prisma.marketInstall.findMany({
      where: { tenantId },
      orderBy: [{ installedAt: 'asc' }, { materialId: 'asc' }],
    })
    return rows.map((row) => this.mapInstall(row))
  }

  async findInstall(tenantId: string, materialId: string): Promise<MarketInstall | null> {
    const row = await this.prisma.marketInstall.findUnique({
      where: { tenantId_materialId: { tenantId, materialId } },
    })
    return row ? this.mapInstall(row) : null
  }

  async createInstall(install: MarketInstall): Promise<boolean> {
    try {
      await this.prisma.marketInstall.create({ data: this.installData(install) })
      return true
    } catch (error) {
      if (this.isUniqueViolation(error)) return false
      throw error
    }
  }

  async updateInstall(install: MarketInstall, expectedRevision: number): Promise<boolean> {
    const result = await this.prisma.marketInstall.updateMany({
      where: {
        tenantId: install.tenantId,
        materialId: install.materialId,
        revision: expectedRevision,
      },
      data: this.installData(install),
    })
    return result.count === 1
  }

  async removeInstall(tenantId: string, materialId: string, expectedRevision: number): Promise<boolean> {
    const result = await this.prisma.marketInstall.deleteMany({
      where: { tenantId, materialId, revision: expectedRevision },
    })
    return result.count > 0
  }

  private materialData(
    material: MarketMaterial,
  ): Omit<Prisma.MarketMaterialUncheckedCreateInput, 'id'> {
    return {
      status: material.status,
      version: material.version,
      name: material.name,
      description: material.description ?? null,
      category: material.category,
      kind: material.kind,
      component: material.component ?? null,
      metaJson: material.meta as unknown as Prisma.InputJsonValue,
      revision: material.revision,
      createdBy: material.createdBy,
      updatedBy: material.updatedBy,
      createdAt: requiredDate(material.createdAt),
      updatedAt: requiredDate(material.updatedAt),
      submittedAt: date(material.submittedAt),
      reviewedAt: date(material.reviewedAt),
      reviewedBy: material.reviewedBy ?? null,
      reviewDecision: material.reviewDecision ?? null,
      reviewNote: material.reviewNote ?? null,
      publishedAt: date(material.publishedAt),
      publishedBy: material.publishedBy ?? null,
      publishedVersion: material.publishedVersion ?? null,
    }
  }

  private installData(install: MarketInstall): Prisma.MarketInstallUncheckedCreateInput {
    return {
      tenantId: install.tenantId,
      materialId: install.materialId,
      version: install.version,
      installedBy: install.installedBy,
      installedAt: requiredDate(install.installedAt),
      updatedAt: requiredDate(install.updatedAt),
      revision: install.revision,
    }
  }

  private mapMaterial(row: {
    id: string
    status: string
    version: string
    name: string
    description: string | null
    category: string
    kind: string
    component: string | null
    metaJson: Prisma.JsonValue
    revision: number
    createdBy: string
    updatedBy: string
    createdAt: Date
    updatedAt: Date
    submittedAt: Date | null
    reviewedAt: Date | null
    reviewedBy: string | null
    reviewDecision: string | null
    reviewNote: string | null
    publishedAt: Date | null
    publishedBy: string | null
    publishedVersion: string | null
  }): MarketMaterial {
    return {
      id: row.id,
      status: row.status as MarketMaterial['status'],
      version: row.version,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      category: row.category as MarketMaterial['category'],
      kind: row.kind as MarketMaterial['kind'],
      ...(row.component ? { component: row.component } : {}),
      meta: meta(row.metaJson),
      revision: row.revision,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
      ...(row.submittedAt ? { submittedAt: iso(row.submittedAt) } : {}),
      ...(row.reviewedAt ? { reviewedAt: iso(row.reviewedAt) } : {}),
      ...(row.reviewedBy ? { reviewedBy: row.reviewedBy } : {}),
      ...(row.reviewDecision
        ? { reviewDecision: row.reviewDecision as NonNullable<MarketMaterial['reviewDecision']> }
        : {}),
      ...(row.reviewNote ? { reviewNote: row.reviewNote } : {}),
      ...(row.publishedAt ? { publishedAt: iso(row.publishedAt) } : {}),
      ...(row.publishedBy ? { publishedBy: row.publishedBy } : {}),
      ...(row.publishedVersion ? { publishedVersion: row.publishedVersion } : {}),
    }
  }

  private mapVersion(row: {
    materialId: string
    version: string
    entryJson: Prisma.JsonValue
    note: string | null
    publishedBy: string
    publishedAt: Date
  }): MarketMaterialVersion {
    return {
      materialId: row.materialId,
      version: row.version,
      entry: row.entryJson as unknown as MarketMaterialVersion['entry'],
      ...(row.note ? { note: row.note } : {}),
      publishedBy: row.publishedBy,
      publishedAt: iso(row.publishedAt),
    }
  }

  private mapInstall(row: {
    tenantId: string
    materialId: string
    version: string
    installedBy: string
    installedAt: Date
    updatedAt: Date
    revision: number
  }): MarketInstall {
    return {
      tenantId: row.tenantId,
      materialId: row.materialId,
      version: row.version,
      installedBy: row.installedBy,
      installedAt: iso(row.installedAt),
      updatedAt: iso(row.updatedAt),
      revision: row.revision,
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  }
}
