<!--
  Button 物料 —— 按钮。归位于 `packages/materials`（Phase 1 第 1 批），由 easycom `^lc-(.*)$` → `@lc/materials/src/$1/index.vue` 解析。
  接口对齐 lc-node：`<lc-button v-bind="model.props" @click="onTap" />`
   - 显式 emit('click')，保证 H5 / 小程序两端事件语义一致
--><template>
  <view class="lc-button-wrap">
    <button
      class="lc-button"
      :class="`lc-button--${type || 'default'}`"
      :disabled="disabled"
      @click="onClick"
    >
      {{ text || label || '按钮' }}
    </button>
  </view>
</template>

<script setup lang="ts">
const props = defineProps<{
  text?: string
  label?: string
  type?: string
  disabled?: boolean
}>()

const emit = defineEmits<{ (e: 'click', payload?: unknown): void }>()

function onClick(e: Event): void {
  if (props.disabled) return
  emit('click', e)
}
</script>

<style scoped>
.lc-button-wrap {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-button {
  width: 100%;
  border-radius: var(--lc-radius-sm);
  font-size: var(--lc-font-body);
  line-height: 2.4;
}
.lc-button--primary {
  background: var(--lc-action-primary);
  color: var(--lc-text-on-brand);
}
.lc-button--primary::after {
  border: none;
}
.lc-button--default {
  background: var(--lc-bg-surface);
  color: var(--lc-text-primary);
}
.lc-button--default::after {
  border: 1rpx solid var(--lc-border-default);
}
</style>
