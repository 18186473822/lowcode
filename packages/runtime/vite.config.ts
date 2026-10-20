import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// uni-app CLI（Vite）工程。@ 插件自带 → src 别名；本工程不定义 build/test/typecheck
// 脚本，避免被根 `pnpm -r` 全量链逮住（uni 构建重且依赖网络，见台账说明）。
export default defineConfig({
  plugins: [uni()],
  server: {
    port: 5173,
    // B-29：本机 IPv6 回环被拦，默认绑 localhost 会解析成 ::1 起不来，显式绑 IPv4
    host: '127.0.0.1',
  },
  // ⚠️ 已知限制：uni 插件强制 `resolve.preserveSymlinks = true`（用户配置覆盖无效），
  // 模块 id 始终带 `node_modules/` 前缀 → 落在 vite watcher 的 ignore 内 →
  // 修改 packages/renderer 源码后 dev server 不会热更，**需重启 `pnpm dev:h5`**。
})
