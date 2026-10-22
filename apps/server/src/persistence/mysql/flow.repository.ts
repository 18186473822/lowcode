/**
 * 流程定义/实例 MySQL 仓储（Phase 4 数据库第二批）。
 *
 * 定义与实例分表且**不建外键**：删除定义后实例仍保留审计；
 * `tasks/history` 是运行时快照，整体存 JSON（与 JSON 文件实现同形状）。
 */
import { Inject, Injectable } from '@nestjs/common'
import { Prisma, type PrismaClient } from '@prisma/client'
import type { FlowSchema } from '@lc/schema'
import { PRISMA_SERVICE } from '../prisma.service.js'
import type { FlowInstance, FlowRepository } from '../../flow/flow.types.js'

function asArray<T>(value: Prisma.JsonValue): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function date(value: string, fallback = new Date()): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

@Injectable()
export class MysqlFlowRepository implements FlowRepository {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaClient) {}

  async listFlows(): Promise<FlowSchema[]> {
    const rows = await this.prisma.flowDefinition.findMany({ orderBy: { createdAt: 'asc' } })
    return rows.map((row) => row.schemaJson as unknown as FlowSchema)
  }

  async findFlow(flowId: string): Promise<FlowSchema | null> {
    const row = await this.prisma.flowDefinition.findUnique({ where: { flowId } })
    return row ? (row.schemaJson as unknown as FlowSchema) : null
  }

  async saveFlow(flow: FlowSchema): Promise<void> {
    const now = new Date()
    const data = {
      modelId: flow.modelId,
      name: flow.name ?? flow.flowId,
      schemaJson: flow as unknown as Prisma.InputJsonValue,
    }
    await this.prisma.flowDefinition.upsert({
      where: { flowId: flow.flowId },
      create: { flowId: flow.flowId, ...data, createdAt: now, updatedAt: now },
      update: { ...data, updatedAt: now },
    })
  }

  async deleteFlow(flowId: string): Promise<boolean> {
    const result = await this.prisma.flowDefinition.deleteMany({ where: { flowId } })
    return result.count > 0
  }

  async listInstances(): Promise<FlowInstance[]> {
    const rows = await this.prisma.flowInstance.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    return rows.map((row) => ({
      id: row.id,
      flowId: row.flowId,
      modelId: row.modelId,
      recordId: row.recordId,
      status: row.status as FlowInstance['status'],
      currentNodeId: row.currentNodeId,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      revision: row.revision,
      ...(asRecord(row.pendingPatchJson) === undefined
        ? {}
        : { pendingPatch: asRecord(row.pendingPatchJson) }),
      tasks: asArray<FlowInstance['tasks'][number]>(row.tasksJson),
      history: asArray<FlowInstance['history'][number]>(row.historyJson),
    }))
  }

  async findInstance(instanceId: string): Promise<FlowInstance | null> {
    const row = await this.prisma.flowInstance.findUnique({ where: { id: instanceId } })
    if (!row) return null
    return {
      id: row.id,
      flowId: row.flowId,
      modelId: row.modelId,
      recordId: row.recordId,
      status: row.status as FlowInstance['status'],
      currentNodeId: row.currentNodeId,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      revision: row.revision,
      ...(asRecord(row.pendingPatchJson) === undefined
        ? {}
        : { pendingPatch: asRecord(row.pendingPatchJson) }),
      tasks: asArray<FlowInstance['tasks'][number]>(row.tasksJson),
      history: asArray<FlowInstance['history'][number]>(row.historyJson),
    }
  }

  async saveInstance(instance: FlowInstance): Promise<void> {
    const data = this.instanceData(instance)
    await this.prisma.flowInstance.upsert({
      where: { id: instance.id },
      create: { id: instance.id, ...data },
      update: data,
    })
  }

  async saveInstanceIfRevision(instance: FlowInstance, expectedRevision: number): Promise<boolean> {
    const data = this.instanceData(instance)
    try {
      const updated = await this.prisma.flowInstance.updateMany({
        where: { id: instance.id, revision: expectedRevision },
        data,
      })
      if (updated.count === 1) return true
      if (await this.prisma.flowInstance.findUnique({ where: { id: instance.id }, select: { id: true } })) {
        return false
      }
      if (expectedRevision !== 0) return false
      await this.prisma.flowInstance.create({ data: { id: instance.id, ...data } })
      return true
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false
      throw error
    }
  }

  private instanceData(instance: FlowInstance) {
    return {
      flowId: instance.flowId,
      modelId: instance.modelId,
      recordId: instance.recordId,
      status: instance.status,
      currentNodeId: instance.currentNodeId,
      createdBy: instance.createdBy,
      createdAt: date(instance.createdAt),
      updatedAt: date(instance.updatedAt),
      revision: instance.revision ?? 0,
      pendingPatchJson:
        instance.pendingPatch === undefined
          ? Prisma.DbNull
          : (instance.pendingPatch as unknown as Prisma.InputJsonValue),
      tasksJson: instance.tasks as unknown as Prisma.InputJsonValue,
      historyJson: instance.history as unknown as Prisma.InputJsonValue,
    }
  }
}
