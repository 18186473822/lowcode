/**
 * designer-web 入口（PLANS.md §1 批 1）
 *
 * 注册顺序即依赖链：**令牌层（最先，保证后续样式有变量可用）**
 * → shim（picker/radio 组件 + uni API + image/switch 增强器由画布挂载）
 * → 物料全局注册（lc-node 模板的 `lc-*` 标签解析）→ Pinia → EP
 * → 主题解析（在挂载前落到根节点，避免首帧闪白/闪黑）。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@lc/tokens/tokens.css'
import '@lc/designer/panel.css'
import '@lc/designer/shim.css'
import './style.css'
import App from './App.vue'
import { registerUniShim, registerMaterials } from '@lc/designer'
import { initTheme } from './theme'

// 主题先于挂载生效：首帧即是对应主题，不出现白→黑跳变
initTheme()

const app = createApp(App)
app.use(createPinia())
app.use(ElementPlus)
registerUniShim(app)
registerMaterials(app)
app.mount('#app')
