<!--
  Chart 物料 —— 图表（Phase 3 批 4，D-P3-10；R10 风控：纯 SVG 手写不引 echarts）。

  接口对齐 lc-node：`<lc-chart v-bind="model.props" />`（纯展示）
  - chartType: 'bar' | 'line' | 'pie'（一组件三形态）
  - 数据三通道（优先级）：① data（静态 JSON 文本）→ ② modelId + dimension/metric → 经
    inject `LC_FLOW_HOST_KEY.request` 拉记录并**客户端聚合** → ③ 空态占位（画布零请求）
  - 渲染：SVG 串 → base64 data URI → `<image :src>`（裸 <svg> 标签 MP 端不支持）
-->
<template>
  <view class="lc-chart">
    <text v-if="title" class="lc-chart__title">{{ title }}</text>
    <image v-if="dataUri" class="lc-chart__img" :src="dataUri" :style="{ height: `${height}px` }" mode="widthFix" />
    <!-- 空态：独立条件（不与下方图例共用 v-if 链，否则 v-else 会挂到图例上 → 图文并存） -->
    <view v-if="!dataUri && loading" class="lc-chart__hint">图表加载中…</view>
    <view v-else-if="!dataUri" class="lc-chart__hint lc-chart__hint--muted">{{ emptyHint }}</view>
    <!-- 饼图无坐标轴 → 补静态图例（纯文本，非 SVG：可测、可选中，且不依赖图片内像素）。
         交互式图例（hover 高亮）/ tooltip 属 §7.4 明确未做范围。 -->
    <view v-if="showLegend && dataUri" class="lc-chart__legend">
      <view v-for="(p, i) in series" :key="`${p.label}-${i}`" class="lc-chart__legend-item">
        <view class="lc-chart__legend-dot" :style="{ background: palette[i % palette.length] }" />
        <text class="lc-chart__legend-label">{{ p.label }}</text>
        <text class="lc-chart__legend-val">{{ formatNumber(p.value) }}</text>
      </view>
    </view>
    <text v-if="error" class="lc-chart__err">{{ error }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { LC_FLOW_HOST_KEY } from '@lc/materials'
import {
  aggregateSeries,
  buildChartSvg,
  CHART_THEMES,
  formatNumber,
  parseSeries,
  RECORDS_SIZE_MAX,
  toDataUri,
  type ChartType,
  type MetricKind,
  type SeriesPoint,
} from './chart-svg'

const props = withDefaults(
  defineProps<{
    chartType?: ChartType
    title?: string
    /** 静态数据（JSON 文本：[{label,value}]；支持表达式） */
    data?: string
    /** 模型 id（与 dimension 同配才取数） */
    modelId?: string
    /** 分组维度字段 key */
    dimension?: string
    /** 聚合方式（缺省 count） */
    metric?: MetricKind
    /** sum/avg/max/min 的数值字段 key */
    metricField?: string
    /** 取前 N 个分类（缺省 8） */
    limit?: number
    /** 渲染高度（px） */
    height?: number
    /** 渲染宽度（px） */
    width?: number
  }>(),
  { chartType: 'bar', metric: 'count', limit: 8, height: 200, width: 320 },
)

const host = inject(LC_FLOW_HOST_KEY, undefined)

const loading = ref(false)
const error = ref('')
const agg = ref<SeriesPoint[]>([])
/** 触发重拉的关键字段（记录在案，watch 比对） */
const needsFetch = computed(() => !parseSeries(props.data).length && !!props.modelId && !!props.dimension)

const series = computed<SeriesPoint[]>(() => (needsFetch.value ? agg.value : parseSeries(props.data)))

/* ---------------- 主题：图表必须按当前亮暗取色 ----------------
 * SVG 会转成 base64 data URI，里面**解析不了 CSS 变量**，所以只能在生成时把颜色定死。
 * 主题来源分两步：H5 / 设计器读 `html[data-theme]`（两端的 theme.ts 都写这里）；
 * 小程序没有 document，退回 uni 的系统主题（部分平台支持，取不到就按亮色）。 */
function detectTheme(): 'light' | 'dark' {
  if (typeof document !== 'undefined') {
    const t = document.documentElement?.getAttribute('data-theme')
    if (t === 'dark') return 'dark'
    if (t === 'light') return 'light'
  }
  try {
    return uni.getSystemInfoSync().theme === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const theme = ref<'light' | 'dark'>(detectTheme())
const chartTheme = computed(() => CHART_THEMES[theme.value])

let themeObserver: MutationObserver | undefined
onMounted(() => {
  // 只在 H5 / 设计器里有 document；观察到 data-theme 变化就重算，实现「切主题即刷新」
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  themeObserver = new MutationObserver(() => {
    const next = detectTheme()
    if (next !== theme.value) theme.value = next
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
})
onUnmounted(() => themeObserver?.disconnect())

const svg = computed(() =>
  buildChartSvg({
    type: props.chartType,
    series: series.value,
    width: Math.max(props.width, 40),
    height: Math.max(props.height, 40),
    theme: chartTheme.value,
  }),
)
const dataUri = computed(() => toDataUri(svg.value))

/** 饼图无坐标轴：补静态图例，让扇区能对应到分类（柱/折靠 x 轴标签，不重复渲染） */
const palette = computed(() => chartTheme.value.palette)
const showLegend = computed(() => props.chartType === 'pie' && series.value.length > 0)

const emptyHint = computed(() => {
  if (needsFetch.value) return '图表（无匹配数据）'
  if (!props.modelId && !props.dimension) return '图表（配置数据或绑定模型 + 维度字段后显示）'
  return '图表（暂无数据）'
})

async function load(): Promise<void> {
  if (!needsFetch.value) return
  if (!host) {
    error.value = ''
    agg.value = []
    return
  }
  loading.value = true
  error.value = ''
  try {
    // 多取样本（limit×20）让聚合更接近全量，但**不得超过服务端 records 的 size 上限**：
    // apps/server `record.service.ts` MAX_SIZE=100，超限直接 400。
    // （H5 实测踩到：limit 默认 8 → 160 → 400「图表取数失败」；此处按上限截断。）
    const size = Math.min(Math.max(props.limit, 1) * 20, RECORDS_SIZE_MAX)
    const res = await host.request({
      method: 'GET',
      url: `/api/v1/models/${props.modelId}/records?page=1&size=${size}`,
    })
    if (res.statusCode < 200 || res.statusCode >= 300) {
      error.value = `图表取数失败（${res.statusCode}）`
      agg.value = []
      return
    }
    const rows = ((res.data as { items?: Array<Record<string, unknown>> })?.items ?? []) as Array<
      Record<string, unknown>
    >
    agg.value = aggregateSeries(rows, {
      dimension: props.dimension,
      metric: props.metric,
      metricField: props.metricField,
      limit: props.limit,
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '图表取数失败'
    agg.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())
watch(
  () => [props.data, props.modelId, props.dimension, props.metric, props.metricField, props.limit],
  () => void load(),
)
</script>

<style scoped>
.lc-chart {
  padding: var(--lc-space-2) var(--lc-space-3);
}
.lc-chart__title {
  display: block;
  margin-bottom: var(--lc-space-1);
  font-size: var(--lc-font-body-sm);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.lc-chart__img {
  width: 100%;
}
.lc-chart__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--lc-space-1) var(--lc-space-3);
  margin-top: var(--lc-space-1);
}
.lc-chart__legend-item {
  display: flex;
  align-items: center;
  gap: 6rpx;
}
.lc-chart__legend-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 3rpx;
  flex: none;
}
.lc-chart__legend-label {
  font-size: var(--lc-font-caption);
  color: var(--lc-text-secondary);
}
.lc-chart__legend-val {
  font-size: var(--lc-font-caption);
  font-weight: var(--lc-weight-semibold);
  color: var(--lc-text-primary);
}
.lc-chart__hint {
  text-align: center;
  color: var(--lc-text-secondary);
  font-size: var(--lc-font-body-sm);
  padding: var(--lc-space-5) 0;
}
.lc-chart__hint--muted {
  color: var(--lc-text-tertiary);
}
.lc-chart__err {
  display: block;
  margin-top: var(--lc-space-1);
  color: var(--lc-status-danger);
  font-size: var(--lc-font-caption);
  text-align: center;
}
</style>
