/**
 * 流程定义与实例的 JSON 文件仓储（Phase 3 批 1 / D-P3-3）。
 *
 * - `flows.json` → `{ flows: FlowSchema[] }`（按 flowId upsert）；
 * - `flow-instances.json` → `{ instances: FlowInstance[] }`（只追加与就地更新，不删 —— 审计可回溯）；
 * - 原子写「临时文件 + rename」同 FileRbacRepository，防半截文件；
 * - 文件不存在 → 空集（无种子 —— 流程定义由接口显式创建）。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Inject, Injectable } from '@nestjs/common'
import type { FlowSchema } from '@lc/schema'
import { DATA_DIR } from '../common/tokens.js'
import { KeyedLock } from '../common/keyed-lock.js'
import type { FlowInstance, FlowRepository } from './flow.types.js'

interface FlowsFile {
  flows: FlowSchema[]
}

interface InstancesFile {
  instances: FlowInstance[]
}

@Injectable()
export class FileFlowRepository implements FlowRepository {
  private readonly flowsFile: string
  private readonly instancesFile: string
  /** 实例文件是单文件集合：所有实例写共用一把锁，避免并发 append 丢数据 */
  private readonly instancesLock = new KeyedLock()

  constructor(@Inject(DATA_DIR) dataDir: string) {
    this.flowsFile = path.join(dataDir, 'flows.json')
    this.instancesFile = path.join(dataDir, 'flow-instances.json')
  }

  private async readJson<T>(file: string, empty: T): Promise<T> {
    try {
      const raw = await readFile(file, 'utf8')
      return JSON.parse(raw) as T
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return empty
      throw error // 文件损坏原样上抛 → 500，不静默吞
    }
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    await rename(tmp, file)
  }

  async listFlows(): Promise<FlowSchema[]> {
    const data = await this.readJson<FlowsFile>(this.flowsFile, { flows: [] })
    return Array.isArray(data.flows) ? data.flows : []
  }

  async findFlow(flowId: string): Promise<FlowSchema | null> {
    const flows = await this.listFlows()
    return flows.find((f) => f.flowId === flowId) ?? null
  }

  async saveFlow(flow: FlowSchema): Promise<void> {
    const flows = await this.listFlows()
    const idx = flows.findIndex((f) => f.flowId === flow.flowId)
    if (idx >= 0) flows[idx] = flow
    else flows.push(flow)
    await this.writeJson(this.flowsFile, { flows })
  }

  async deleteFlow(flowId: string): Promise<boolean> {
    const flows = await this.listFlows()
    const next = flows.filter((f) => f.flowId !== flowId)
    if (next.length === flows.length) return false
    await this.writeJson(this.flowsFile, { flows: next })
    return true
  }

  async listInstances(): Promise<FlowInstance[]> {
    const data = await this.readJson<InstancesFile>(this.instancesFile, { instances: [] })
    return Array.isArray(data.instances)
      ? data.instances.map((inst) => ({ ...inst, revision: inst.revision ?? 0 }))
      : []
  }

  async findInstance(instanceId: string): Promise<FlowInstance | null> {
    const instances = await this.listInstances()
    return instances.find((inst) => inst.id === instanceId) ?? null
  }

  async saveInstance(instance: FlowInstance): Promise<void> {
    await this.instancesLock.runExclusive('flow-instances', async () => {
      const instances = await this.listInstances()
      const idx = instances.findIndex((i) => i.id === instance.id)
      if (idx >= 0) instances[idx] = instance
      else instances.push(instance)
      await this.writeJson(this.instancesFile, { instances })
    })
  }

  async saveInstanceIfRevision(instance: FlowInstance, expectedRevision: number): Promise<boolean> {
    return this.instancesLock.runExclusive('flow-instances', async () => {
      const instances = await this.listInstances()
      const idx = instances.findIndex((i) => i.id === instance.id)
      const currentRevision = idx >= 0 ? (instances[idx].revision ?? 0) : 0
      if (currentRevision !== expectedRevision) return false

      if (idx >= 0) instances[idx] = instance
      else instances.push(instance)
      await this.writeJson(this.instancesFile, { instances })
      return true
    })
  }
}
