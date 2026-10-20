#!/usr/bin/env node
/**
 * build-icon-sheet.mjs —— 生成物料图标规格表（design review 用）
 *
 * 为什么需要：33 个图标是手绘路径，代码里看不见。审阅时不必启动设计器，
 * 打开 `docs/material-icons.html` 即可逐项核对隐喻是否贴切、视觉重量是否一致。
 *
 * 单一真相源：直接读 `packages/materials/src/meta/*.ts`（物料名/标题）与
 * `packages/designer/src/canvas/material-icons.ts`（图标路径），不维护第二份清单。
 *
 * 用法：pnpm icons:sheet
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ICONS_TS = resolve(ROOT, 'packages/designer/src/canvas/material-icons.ts')
const META_DIR = resolve(ROOT, 'packages/materials/src/meta')
const OUT = resolve(ROOT, 'docs/material-icons.html')

/* ---------- 1. 图标：name → 内部标记 ---------- */
const iconsSrc = readFileSync(ICONS_TS, 'utf8')
const icons = []
for (const m of iconsSrc.matchAll(/^ {2}(\w+):\s*\n?\s*'([^']+)',/gm)) {
  icons.push({ name: m[1], markup: m[2] })
}
if (!icons.length) {
  console.error('FAIL：没能从 material-icons.ts 解析出任何图标 —— 检查条目格式是否为 `Name: \'...\'`')
  process.exit(1)
}

/* ---------- 2. 物料名 → 标题 / 分类 ---------- */
const titles = new Map()
const cats = new Map()
for (const f of readdirSync(META_DIR)) {
  if (!f.endsWith('.ts') || f === 'index.ts') continue
  const t = readFileSync(`${META_DIR}/${f}`, 'utf8')
  const names = [...t.matchAll(/name:\s*'([^']+)'/g)].map((x) => x[1])
  const ts = [...t.matchAll(/title:\s*'([^']+)'/g)].map((x) => x[1])
  const cs = [...t.matchAll(/category:\s*'([^']+)'/g)].map((x) => x[1])
  names.forEach((n, i) => {
    if (ts[i]) titles.set(n, ts[i])
    if (cs[i]) cats.set(n, cs[i])
  })
}

const CAT_LABEL = {
  basic: '基础',
  layout: '布局',
  form: '表单',
  data: '数据',
  nav: '导航',
  feedback: '反馈',
  biz: '业务',
}
const CAT_ORDER = ['basic', 'layout', 'form', 'data', 'nav', 'feedback', 'biz']

/** 单个图标的外壳（与 MaterialPanel 的渲染规格保持一致） */
const svg = (markup, size) =>
  `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`

/* ---------- 3. 生成 HTML ---------- */
const groups = CAT_ORDER.map((cat) => ({
  cat,
  items: icons.filter((i) => (cats.get(i.name) ?? '?') === cat),
})).filter((g) => g.items.length)

const rows = groups
  .map(
    (g) => `
    <section>
      <h2>${CAT_LABEL[g.cat] ?? g.cat} <span class="count">${g.items.length}</span></h2>
      <div class="grid">
        ${g.items
          .map(
            (i) => `<figure>
          <div class="sizes">
            <span class="x3">${svg(i.markup, 48)}</span>
            <span class="x2">${svg(i.markup, 32)}</span>
            <span class="x1">${svg(i.markup, 16)}</span>
          </div>
          <figcaption><b>${titles.get(i.name) ?? i.name}</b><code>${i.name}</code></figcaption>
        </figure>`,
          )
          .join('\n        ')}
      </div>
    </section>`,
  )
  .join('\n')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>物料图标规格表 · ${icons.length} 个</title>
<style>
  :root {
    --ink: #1f2329; --ink2: #6b7684; --ink3: #9aa5b1;
    --line: #e3e8ee; --bg: #f5f6f8; --card: #fff; --brand: #2b6de8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 32px 64px;
    font: 400 14px/1.6 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: var(--ink); background: var(--bg);
  }
  header { max-width: 1180px; margin: 0 auto 32px; }
  h1 { margin: 0 0 8px; font-size: 22px; font-weight: 600; letter-spacing: -0.2px; }
  .lede { margin: 0; color: var(--ink2); max-width: 70ch; }
  .spec {
    margin: 20px 0 0; padding: 14px 16px; border-radius: 8px;
    background: var(--card); border: 1px solid var(--line);
    display: flex; flex-wrap: wrap; gap: 8px 28px;
  }
  .spec div { font-size: 13px; color: var(--ink2); }
  .spec b { color: var(--ink); font-weight: 600; }
  section { max-width: 1180px; margin: 0 auto 28px; }
  h2 {
    margin: 0 0 12px; font-size: 13px; font-weight: 600; color: var(--ink2);
    text-transform: none; letter-spacing: .3px;
    display: flex; align-items: center; gap: 8px;
  }
  h2::after { content: ""; flex: 1; height: 1px; background: var(--line); }
  .count { color: var(--ink3); font-weight: 400; }
  .grid {
    display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  }
  figure {
    margin: 0; padding: 16px 14px 12px; border-radius: 8px;
    background: var(--card); border: 1px solid var(--line);
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    transition: border-color .15s, box-shadow .15s;
  }
  figure:hover { border-color: var(--brand); box-shadow: 0 2px 8px rgba(43,109,232,.08); }
  .sizes { display: flex; align-items: flex-end; gap: 10px; height: 52px; color: var(--ink); }
  figure:hover .sizes { color: var(--brand); }
  .x1 { color: var(--ink2); }
  figcaption { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  figcaption b { font-size: 13px; font-weight: 500; }
  figcaption code { font: 400 11px/1.4 ui-monospace, Menlo, Consolas, monospace; color: var(--ink3); }
  footer { max-width: 1180px; margin: 8px auto 0; color: var(--ink3); font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>物料图标规格表</h1>
  <p class="lede">物料面板的 33 个图标。左起 3×（48px）/ 2×（32px）/ 1×（16px）—— 重点看 <b>16px 那一列</b>是否仍可辨认，那是实际使用尺寸。</p>
  <div class="spec">
    <div>网格 <b>16 × 16</b></div>
    <div>活区 <b>2 – 14</b></div>
    <div>描边 <b>1.5</b></div>
    <div>端点 <b>圆角</b></div>
    <div>上色 <b>currentColor</b></div>
    <div>总计 <b>${icons.length}</b></div>
  </div>
</header>
${rows}
<footer>由 <code>pnpm icons:sheet</code> 从 <code>packages/designer/src/canvas/material-icons.ts</code> 生成 —— 请勿手改本文件。</footer>
</body>
</html>
`

writeFileSync(OUT, html, 'utf8')
console.log(`已生成 docs/material-icons.html（${icons.length} 个图标 / ${groups.length} 组）`)
