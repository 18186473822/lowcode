/**
 * 单进程 keyed 互斥锁。
 *
 * 用途：JSON 仓储的「读 → 判版本 → 写」必须串行，否则并发请求会同时读到旧版本。
 * 不同 key 互不阻塞，避免全局限流；MySQL 模式仍以数据库行级 CAS 为准，
 * 本锁只负责当前进程内的串行化（多实例不能依赖它）。
 */
export class KeyedLock {
  private readonly tails = new Map<string, Promise<void>>()

  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()

    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => gate)
    this.tails.set(key, tail)

    await previous
    try {
      return await fn()
    } finally {
      release()
      if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}
