<!--
  Text 物料 —— 纯展示文本。归位于 `packages/materials`（Phase 1 第 1 批），由 easycom `^lc-(.*)$` → `@lc/materials/src/$1/index.vue` 解析。
  接口对齐 lc-node：`<lc-text v-bind="model.props" />`（扁平属性展开）
--><template>
  <view class="lc-text">
    <text class="lc-text__content">{{ display }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  text?: string
  label?: string
}>()

const display = computed(() => props.text ?? props.label ?? '')
</script>

<style scoped>
.lc-text {
  padding: 12rpx var(--lc-space-3);
}
.lc-text__content {
  font-size: var(--lc-font-body);
  color: var(--lc-text-primary);
  line-height: 1.6;
  word-break: break-all;
}
</style>
