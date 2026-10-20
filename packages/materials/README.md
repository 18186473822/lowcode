# @lc/materials —— 低代码物料库

> 方案 9.1 目录树 `packages/materials/ ★ 物料库`；Phase 1 第 1 批从 `runtime/src/materials` 归位至此。
> 一个物料 = 一个 uni-app 组件（`src/<name>/index.vue`）+ 一份 meta（`src/<name>/meta.json`，流水线②）。

## 解析机制

easycom（`runtime/src/pages.json`，D-12 三规则之三）：

```jsonc
"^lc-(.*)$": "@lc/materials/src/$1/index.vue"   // <lc-input /> → src/input/index.vue
```

- **不独立编译**：本包无 build/typecheck 脚本（同 `runtime` 处理），宿主（uni 工程）的 vite 直接消费 `.vue` 源码；
- 目录名 = componentName 的 **kebab-case**（`NumberInput` → `number-input/`），easycom 标签同样 kebab（`<lc-number-input>`，规则捕获 `$1` 后拼 `src/$1/index.vue`）。

## 物料开发规范（协议 4 章 / 方案 4.2）

```vue
<template>
  <view class="lc-xxx">                     <!-- 规范3：全部 rpx，禁 px / 固定高度 -->
    <text v-if="label">{{ label }}</text>
    <input :value="displayValue" @input="onInput" />
    <view v-if="error"><text>{{ error }}</text></view>
  </view>
</template>
<script setup lang="ts">
// 规范1：只接收 props，不自己管理业务状态（业务状态在 formData）
// 规范2：双向值必须汇报给渲染引擎 —— emit('update', { name, value })
//        （引擎接管 setField → 联动/校验/重渲染；name 可省略，lc-node 从 node.props.name 兜底）
// 规范4：平台差异用条件编译 #ifdef MP-WEIXIN / APP-PLUS / H5
const props = defineProps<{ name?: string; label?: string; value?: unknown; error?: string; /* … */ }>()
const emit = defineEmits<{ (e: 'update', payload: { name?: string; value: unknown }): void }>()
</script>
```

**事件契约（以运行时实现为准，已 H5 实测 + 单测固化）**：

| 事件 | 消费者 | 载荷 | 用途 |
|---|---|---|---|
| `update` | `lc-node` → `controller.setField` + `emit('change')` | `{ name?, value }` | 表单字段写值（联动/校验触发点） |
| `click` | `lc-node` → `controller.handleEvent('click', actions)` | 任意 | 按钮类交互（动作链入口） |

> 方案 4.2 草稿写的 `emit('change', v)` **不采用**——运行时契约 `update` 载荷式已实测，协议以实现 + `docs/protocol.md` 为准。

## Phase 1 第 1 批清单（12 个）

| 分类 | 物料 | 状态 |
|---|---|---|
| layout | Page、**FormGroup**（容器） | Page ✅（lc-node 容器分支）/ FormGroup 🟡 本批 |
| basic | **Text**、**Image**、**Divider** | Text ✅ / Image·Divider 🟡 本批 |
| form | **Input**、**Textarea**、**NumberInput**、**Radio**、**Select**、**Switch**、**Upload** | Input ✅ / 其余 🟡 本批 |
| feedback | **Button** | ✅ |

（加 lc-node 既有 Page 容器分支共 12 个 = 方案 Phase 1 事项「物料 12 个」）

## 未做（后续批次）

- `meta.json` + `src/index.ts` 注册表（流水线②③）——与设计器面板同批交付
- 构建期裁剪（流水线④ `used-materials.json`）
- Upload 真实上传待服务端文件上传接口（Phase 1 第 2 批）
