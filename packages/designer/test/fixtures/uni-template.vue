<!--
  uni-template.vue —— B-22 实测结论的固化（PLANS.md §1 D-A1 修正）
  ① view/text/image/switch：**SVG 标签**，Vue 编译期按保留元素直出（组件 shim 无效）
     → 断言直出 + CSS/增强器兜底；
  ② picker/radio/radio-group：不在保留名单 → 组件 shim 生效。
  模板由 @vitejs/plugin-vue 编译，与 designer-web 生产构建同一路径。
-->
<template>
  <view class="r2-root">
    <text class="r2-text">文本</text>
    <picker class="r2-picker" :range="['甲', '乙']" :value="0" />
    <radio-group class="r2-group">
      <radio value="a" :checked="true" />
    </radio-group>
    <switch class="r2-switch" :checked="true" />
    <image class="r2-image" src="x.png" mode="aspectFill" />
  </view>
</template>

<script setup lang="ts"></script>
