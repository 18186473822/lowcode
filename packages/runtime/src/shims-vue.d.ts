/** .vue 模块类型垫片（Phase 0 不引入 vue-tsc，组件类型按宽松 any 处理） */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
