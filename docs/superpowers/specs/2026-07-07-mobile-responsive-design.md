# GuaLingo 移动端响应式适配设计

**日期**：2026-07-07
**状态**：已批准，待生成实现计划
**范围**：整个学习界面（主页、登录、学习应用、单词表、字典、题目、设置）+ Admin 管理后台

## 1. 背景与现状

GuaLingo 前端（React + Vite + Tailwind CSS）的响应式设计严重偏科：

- **LandingPage 落地页**：已有 20 处响应式断点 + Canvas 移动端优化，基本完善
- **LearningApp 学习应用及所有子组件**（题目、单词表、字典、设置等）：几乎无响应式断点，依赖 `max-w-3xl mx-auto` + `flex-wrap` 简单自适应，在手机上出现内容挤压、双栏过窄、模态框溢出等明显问题
- **Admin 后台**：完全按桌面端设计，移动端基本不可用（固定 `w-56` 侧边栏、8 列表格、多个固定宽度模态框）

### 主要问题清单（按严重程度）

| 严重度 | 位置 | 问题 |
|--------|------|------|
| P0 | [DictionaryStep.jsx](file:///workspace/frontend/src/components/DictionaryStep.jsx) 第 955 行 | 句子翻译 + 词汇表双栏 `w-1/2` 固定，手机上每栏仅 160-187px |
| P0 | [SettingsModal.jsx](file:///workspace/frontend/src/components/SettingsModal.jsx) 第 371 行 | 固定 `w-[580px] h-[520px]`，375px 手机必溢出 |
| P0 | [AdminUsers.jsx](file:///workspace/frontend/src/components/AdminUsers.jsx) 第 168 行 | 8 列表格无 `overflow-x-auto`，手机上必溢出 |
| P0 | [AdminPage.jsx](file:///workspace/frontend/src/pages/AdminPage.jsx) 第 28 行 | 固定 `w-56` 侧边栏，375px 手机上占 60% |
| P1 | [AdminApiKeys.jsx](file:///workspace/frontend/src/components/AdminApiKeys.jsx) 第 447/503/584 行 | 三个固定宽度模态框 `w-[480px]`/`w-[420px]` |
| P1 | [LearningStep.jsx](file:///workspace/frontend/src/components/LearningStep.jsx) 第 132 行 | 选项 `grid-cols-2` 固定，无响应式 |
| P1 | [HistorySidebar.jsx](file:///workspace/frontend/src/components/HistorySidebar.jsx) | 260px 侧边栏无抽屉模式，48px 折叠态在小屏仍占位 |
| P1 | [LandingPage.jsx](file:///workspace/frontend/src/pages/LandingPage.jsx) 第 291 行 | 移动端导航 `hidden sm:flex` 后无替代入口 |
| P2 | 题目组件（SentenceQuizStep 等） | `p-8` 内边距移动端过大 |
| P2 | [LoginPage.jsx](file:///workspace/frontend/src/pages/LoginPage.jsx) 第 46 行 | DotBackground 固定 `sp=28`，未对齐 LandingPage 的移动端优化 |

## 2. 设计决策

### 2.1 范围决策

- **包含 Admin 后台**：完整改造为移动端可用（侧边栏抽屉、表格转卡片、模态框自适应）
- **目标设备**：手机（320px+）+ 平板（768-1024px）+ 桌面（1024px+），三档全覆盖

### 2.2 技术方案：渐进式响应式适配（方案 A）

在现有组件上直接加 Tailwind 响应式前缀（`sm:`/`md:`/`lg:`），把固定宽度改成响应式，双栏改单栏/抽屉。仅在有交互需求处（抽屉开关、横向滑动 snap）加少量 JS。

**选择理由**：
- 与 LandingPage 已验证的模式一致
- 改动局部、风险低、不动架构
- 一套代码同时服务手机/平板/桌面，维护成本低
- 你选的交互方案（抽屉复用现有按钮、横向滑动、卡片列表）都能在此框架内实现

### 2.3 断点策略

沿用 Tailwind 默认断点（与 LandingPage 现有模式一致）：

| 断点 | 宽度 | 行为 |
|------|------|------|
| 默认 | `<640px` | 手机：单栏、抽屉、卡片、全屏模态 |
| `sm` | 640px+ | 大手机/小平板：部分双栏恢复、抽屉可常驻 |
| `md` | 768px+ | 平板：双栏恢复、侧边栏可折叠常驻 |
| `lg` | 1024px+ | 桌面：保持现有布局不变 |

### 2.4 关键 UX 决策

| 组件 | 手机行为 | 平板/桌面 |
|------|----------|-----------|
| HistorySidebar | 抽屉模式（复用现有 SVG 按钮，完全隐藏/滑入展开两态，无 48px 折叠态） | 保持现有三态（260 展开 / 48 折叠） |
| DictionaryStep 双栏 | 横向滑动（snap 对齐 + 圆点指示器，无文字标签） | 保持 50/50 双栏 |
| AdminUsers 表格 | 卡片列表（字段纵向堆叠） | 恢复 8 列表格 |
| AdminPage 侧边栏 | 汉堡 + 抽屉 | 常驻 w-56 |
| SettingsModal | 全屏模态 + 顶部水平 Tab | 固定 580x520 + 左侧 130px 导航 |

## 3. 详细设计

### 3.1 全局基础

#### viewport meta
[index.html](file:///workspace/frontend/index.html) 第 6 行现有 `width=device-width, initial-scale=1.0` 保持不变（保留用户缩放能力，符合无障碍）。

#### 通用响应式模式
统一应用到所有组件：

1. **固定宽度 → 响应式**：所有 `w-[XXXpx]` 模态框改为 `w-full max-w-[XXXpx]`，配合外层 `p-4` 留边距
2. **大内边距 → 响应式**：`p-8` → `p-4 sm:p-8`；`px-8` → `px-4 sm:px-8`
3. **固定网格 → 响应式**：`grid-cols-2` → `grid-cols-1 sm:grid-cols-2`（按内容密度调整）
4. **横向溢出防护**：所有可能溢出的容器加 `min-w-0` + `overflow-x-auto`；根容器统一 `overflow-x-hidden`
5. **字体大小**：大标题 `text-4xl` → `text-3xl sm:text-4xl`

#### 全局 CSS 工具类（[index.css](file:///workspace/frontend/src/index.css)）
新增三个工具类：

```css
/* 抽屉遮罩 */
.mobile-drawer-overlay {
  @apply fixed inset-0 bg-black/40 z-40;
}

/* 横向滑动容器（snap 对齐） */
.touch-scroll-x {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x mandatory;
}

/* snap 子项（占满视口宽度） */
.snap-item {
  scroll-snap-align: start;
  flex-shrink: 0;
  width: 100%;
}
```

#### useMediaQuery hook（新增 [utils/useMediaQuery.js](file:///workspace/frontend/src/utils/useMediaQuery.js)）

```js
import { useState, useEffect } from 'react'

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}
```

仅在需要 JS 逻辑分支处使用（抽屉开关、表格/卡片切换等）。纯布局变化一律用 Tailwind 响应式前缀，不依赖 JS。

**SSR/首屏注意**：本项目是 Vite SPA（`main.jsx` 客户端渲染），无 SSR，`window` 在渲染时一定存在。初值取 `matchMedia().matches` 避免首帧闪烁（FOUC）。

### 3.2 LandingPage 落地页

#### 移动端导航汉堡菜单（[LandingPage.jsx](file:///workspace/frontend/src/pages/LandingPage.jsx) 第 282 行附近）

现状：桌面导航 `hidden sm:flex`，`<640px` 完全隐藏且无替代入口。

方案：
- `sm` 以下显示汉堡按钮（`sm:hidden`），点击展开下拉菜单（纵向堆叠：功能/模式/价格/登录/注册）
- 菜单用 React state 控制 `isOpen`，配合 `framer-motion`（项目已依赖）做高度/透明度过渡
- 菜单展开时点击外部或导航项后自动收起
- 桌面端（`sm+`）保持现有 `hidden sm:flex` 不变

```
桌面 (sm+):    [Logo] ........ [功能 模式 价格 登录 注册]
手机 (<sm):    [Logo] ........................ [☰]
                                          ↓ 点击
                                      ┌──────────┐
                                      │ 功能     │
                                      │ 模式     │
                                      │ 价格     │
                                      │ ─────── │
                                      │ 登录     │
                                      │ 注册     │
                                      └──────────┘
```

#### 其他细节微调

- 第 493-505 行对比区三栏 `flex items-center gap-4 md:gap-8` → `gap-2 sm:gap-4 md:gap-8`，两侧文字块加 `flex-1 min-w-0` 防溢出
- Hero 区 `min-h-screen`（第 312 行）→ `min-h-[100svh]`（small viewport height，旧浏览器回退 `min-h-screen`），解决移动端地址栏导致 100vh 异常
- 各 section `px-6`（第 358/388/415 行等）→ `px-4 sm:px-6`
- Canvas 动画（第 26-31 行）：已通过 `matchMedia('(max-width: 768px)')` 优化，保持不变
- Footer（第 681 行）：`flex flex-col md:flex-row` 已正确，保持不变

### 3.3 LoginPage 登录页

LoginPage 是目前布局最简洁的页面，移动端基本可用，只需小幅优化。

#### 主布局（[LoginPage.jsx](file:///workspace/frontend/src/pages/LoginPage.jsx) 第 106-109 行）
现状 `min-h-screen flex items-center justify-center` + 卡片 `w-full max-w-md mx-4` 已正确，保持不变。

#### 背景动画 DotBackground（第 46 行）
现状固定 `sp = 28`，未针对移动端优化。对齐 LandingPage 策略：
- 移动端（`max-width: 768px`）：`sp = 56`（点距翻倍，减少节点数）、帧率 30fps
- 桌面端：保持 `sp = 28`、60fps

#### 卡片内边距
检查登录卡片内部 padding，若有 `p-8` 改为 `p-5 sm:p-8`。

#### 表单元素
输入框 `w-full`（第 184/197/210 行）已正确自适应，保持不变。

### 3.4 LearningApp 学习应用主容器

#### 主容器根元素（[LearningApp.jsx](file:///workspace/frontend/src/pages/LearningApp.jsx) 第 1267-1268 行）
- `h-screen` → `h-[100svh]`（旧浏览器回退 `h-screen`）
- 保留 `overflow-hidden`

#### Input 步骤布局（第 1274-1338 行）
现状：`<div className="flex h-full"> <HistorySidebar/> <div className="flex-1 min-w-0 ...">`

方案：
- 手机（`<md`）：HistorySidebar 渲染为抽屉（`fixed` 定位脱离文档流），主内容区占满全宽
- 平板/桌面（`md+`）：恢复现有 `flex` 布局，侧边栏常驻

```
桌面 (md+):                          手机 (<md):
┌──────────────────────────┐         ┌──────────────────────┐
│ [侧][    主内容区        ]│         │ [☰]  主内容区全宽    │
│ [栏][                    ]│         │                      │
│ [48][                    ]│         │      (无侧边栏占位)  │
│ [px][                    ]│         │                      │
└──────────────────────────┘         └──────────────────────┘
                                     点击☰ →
                                     ┌──────┬─────────────┐
                                     │侧边栏│  (遮罩半透明)│
                                     │260px │             │
                                     └──────┴─────────────┘
```

实现：用纯 CSS——让 HistorySidebar 在 `<md` 时 `fixed` + transform 滑入/滑出，在 `md+` 时 `relative` 常驻。

#### 学习步骤布局（第 1339-1637 行）
现状 `h-full overflow-y-auto px-4 sm:px-6 lg:px-8 py-4` 已正确（LearningApp 现有 4 处响应式之一）。子组件内部统一 `max-w-3xl mx-auto`，移动端自动居中且不超宽。保持不变。

#### HistorySidebar 抽屉化（[HistorySidebar.jsx](file:///workspace/frontend/src/components/HistorySidebar.jsx)）

现状：`SIDEBAR_WIDTH = 260`（第 283 行 JS 常量），通过 framer-motion `animate={{ width }}` 控制；折叠态 `width: 48`（第 432 行）。

方案（复用现有 SVG 按钮，不加新按钮）：
- 手机（`<md`）：
  - 默认收起为抽屉隐藏状态（`fixed left-0 top-0 h-full z-50 -translate-x-full`，完全移出视口）
  - 复用现有展开/收起 SVG 按钮：点击展开时侧边栏从左滑入（`translate-x-0`），同时显示半透明遮罩（`.mobile-drawer-overlay`）
  - 抽屉宽度仍为 260px（在 320px 屏上占 81%，符合移动抽屉惯例）
  - 点击遮罩或选择某项会话后自动收起
  - 折叠态（48px 图标列）在手机上**不再显示**——手机上只有"完全隐藏"和"抽屉展开"两态，避免 48px 占用宝贵宽度
- 平板/桌面（`md+`）：保持现有三态（260 展开 / 48 折叠），行为不变

实现要点：
- 现有折叠/展开 state（控制 `width`）在手机上语义改为"显示/隐藏抽屉"
- 添加 `useMediaQuery('(min-width: 768px)')` 判断 `md+`，仅在 `md+` 时应用 width 动画；手机时改用 transform 动画
- 遮罩层只在手机展开时渲染（`md:hidden`）
- 上下文菜单（第 70-83 行 `min-w-[160px]`，位置通过 `window.innerWidth` 计算防出屏）保持不变

### 3.5 DictionaryStep 字典主视图

这是目前最严重的移动端布局问题。按横向滑动方案处理。

#### 双栏容器（[DictionaryStep.jsx](file:///workspace/frontend/src/components/DictionaryStep.jsx) 第 955 行）

现状：`<div className="flex gap-6 flex-1 min-h-0" style={{ overflow: 'hidden' }}>` + 两个 `w-1/2` 子栏。

方案（手机横向滑动，平板/桌面保持双栏）：

```
桌面 (md+):                          手机 (<md):
┌───────────┬───────────┐            ┌──────────────────────┐
│ 句子翻译  │  词汇表   │            │  ●  ○                │ ← 圆点指示器
│           │           │            ├──────────────────────┤
│ (滚动)    │ (滚动)    │            │  句子翻译           │
│           │           │            │  (全宽，独占视口)   │
│           │           │            │  ← 左右滑动切换 →   │
└───────────┴───────────┘            └──────────────────────┘
```

实现：
- 容器在 `<md` 时改为 `flex overflow-x-auto touch-scroll-x`（用 `.touch-scroll-x` 工具类，含 `scroll-snap-type: x mandatory`）
- 两个子栏在 `<md` 时：`w-full shrink-0 snap-item`（每个占满视口宽度，snap 对齐）；`md+` 时恢复 `md:w-1/2`
- `gap-6` 改为 `gap-0 md:gap-6`（手机上无 gap，靠 snap 分隔）
- 容器的 `overflow: hidden` 内联样式改为仅在 `md+` 生效——手机上需要 `overflow-x: auto` 才能滑动。用 CSS 类替代内联样式：`md:overflow-hidden`
- 两个子栏内部的 `style={{ minWidth: '140px' }}`（第 960/1057 行）在手机上去掉（全宽时不需要 min-width），改为 `md:min-w-[140px]`

#### 顶部工具栏（第 842-918 行）
- 工具栏 `flex items-center gap-3` → `flex items-center gap-2 md:gap-3 flex-wrap`（允许换行，避免窄屏挤压）
- 文件标题 `max-w-[250px]` → `max-w-[150px] md:max-w-[250px]`（手机上截断更早）
- 进度条 `w-24` → `w-16 md:w-24`

#### 滑动指示器（新增）
手机上在双栏顶部加圆点指示器：
- 两个小圆点（当前栏 `bg-amber-400`，另一栏 `bg-aged-300`）
- 无文字标签
- 通过 `onScroll` 事件 + `scrollLeft / clientWidth` 计算当前 snap 索引（需 debounce 避免频繁 setState）
- 仅在 `<md` 渲染（`md:hidden`）

#### 字母索引侧栏（第 1084 行 `w-5 shrink-0`）
20px 固定宽度，手机上仍 OK。保持不变。

#### 分页按钮（第 794 行 `min-w-[22px]`）
小元素固定宽度，保持不变。

### 3.6 单词学习与题目类组件

#### LearningStep 单词学习（[LearningStep.jsx](file:///workspace/frontend/src/components/LearningStep.jsx)）
- 第 57 行 `max-w-3xl mx-auto`：保持不变
- 第 132 行 `grid grid-cols-2 gap-3` → `grid grid-cols-1 sm:grid-cols-2 gap-3`（手机单列，避免长释义挤压）
- 第 105/171 行 `text-4xl` → `text-3xl sm:text-4xl`

#### 题目组件共性调整
四个组件（SentenceQuizStep / ListeningQuizStep / MaskedSentenceExerciseStep / TranslationReconstructionStep）结构相似，统一处理：

- 根容器 `max-w-3xl mx-auto`：保持不变
- 题目卡片内边距 `p-8`（如 [SentenceQuizStep.jsx](file:///workspace/frontend/src/components/SentenceQuizStep.jsx) 第 116 行）→ `p-4 sm:p-8`
- 顶部工具栏 `flex items-center justify-between mb-8`（第 86 行）→ `flex items-center justify-between gap-2 mb-6 sm:mb-8`（加 gap 防挤压，mb 略减）
- 答案放置区 `flex flex-wrap gap-2`：保持（已自适应）
- 选项按钮区 `flex flex-wrap gap-3` / `gap-2`：保持（已自适应）
- 操作按钮 `flex gap-4`（第 236 行）+ 按钮 `flex-1 py-4`（第 243/254 行）：保持（flex-1 自动均分宽度）

题目组件本身用 `flex-wrap` 较多，移动端基本能自适应，主要问题是 `p-8` 过大和工具栏挤压。

#### VocabListStep 单词表弹窗（[VocabListStep.jsx](file:///workspace/frontend/src/components/VocabListStep.jsx)）
现状已较友好。调整：
- 第 192 行 `max-w-2xl max-h-[85vh] w-full` → `max-w-2xl max-h-[90vh] w-full`（手机上弹窗稍高，利用更多屏幕）
- 字母索引 `w-5 shrink-0`（第 243 行）：保持
- 单词行 `flex-1 min-w-0 flex items-center gap-2 flex-wrap`（第 292 行）：已正确，保持

#### WordListPanel 词汇总览面板（[WordListPanel.jsx](file:///workspace/frontend/src/components/WordListPanel.jsx)）
- 全屏模式（第 454-506 行）：`h-full flex flex-col ... min-h-0`，保持
- 折叠面板模式（第 508-575 行）：`max-h-[420px] overflow-y-auto`（第 567 行）→ `max-h-[60vh] sm:max-h-[420px]`（用视口百分比，避免小屏 420px 过高或大屏过低）
- 单词行（第 395 行）`flex items-center gap-2`（word + ipa + part_of_speech）：无 `flex-wrap`，改为 `flex items-center gap-2 flex-wrap`（让 part_of_speech 可换行）

#### WordDetail 单词详情卡（[WordDetail.jsx](file:///workspace/frontend/src/components/WordDetail.jsx)）
现状已是纯纵向堆叠 + `flex-wrap`，移动端友好，无需改动。

### 3.7 AllUnitsStep 与其他学习步骤组件

#### AllUnitsStep 单元总览（[AllUnitsStep.jsx](file:///workspace/frontend/src/components/AllUnitsStep.jsx)）
- 第 110 行单元卡片 `style={{ width: '5rem', height: '5rem' }}`（80x80px 固定）：检查其网格布局——若有 grid 加响应式列数；若是 flex-wrap 保持（80px 卡片能自适应换行）
- 第 186 行 `min-w-[60px]`（分页文字）：保持
- 第 235-292 行顶部工具栏 `flex items-center gap-2` → `flex items-center gap-1 sm:gap-2 flex-wrap`，让开关或主页按钮在极窄屏可换行
- 第 244 行 `max-w-[240px]` → `max-w-[140px] sm:max-w-[240px]`
- 第 313 行 `style={{ width: 'calc(50% - 4px)' }}`（Tab 指示器）：保持（50% 在任何宽度下都 OK）

#### InputStep 输入步骤（[InputStep.jsx](file:///workspace/frontend/src/components/InputStep.jsx)）
- 容器在 LearningApp 中已用 `flex-1 min-w-0 ... px-4 sm:px-6 lg:px-8 py-4`（第 1274-1338 行），响应式 padding 已正确
- 内部布局按需补 `min-w-0` 和响应式 padding

#### PhaseSelectorStep 阶段选择（[PhaseSelectorStep.jsx](file:///workspace/frontend/src/components/PhaseSelectorStep.jsx)）
- 第 38 行 `grid grid-cols-1 md:grid-cols-2` → `grid grid-cols-1 sm:grid-cols-2`（让大手机也能双列）

#### PhaseProgressStep 阶段进度（[PhaseProgressStep.jsx](file:///workspace/frontend/src/components/PhaseProgressStep.jsx)）
- 第 41 行 `grid grid-cols-2 md:grid-cols-3`：已有响应式（手机 2 列），保持

#### ProgressStep 进度（[ProgressStep.jsx](file:///workspace/frontend/src/components/ProgressStep.jsx)）
- 第 63 行 `grid grid-cols-2 md:grid-cols-3`：已有响应式（手机 2 列），保持

### 3.8 SettingsModal 设置弹窗

P0 级问题（固定 `w-[580px] h-[520px]`，手机上必溢出）。

#### 模态框尺寸（[SettingsModal.jsx](file:///workspace/frontend/src/components/SettingsModal.jsx) 第 371 行）
- 手机：全屏模态（`w-full h-full`，即 `inset-0`），无圆角无边距
- 平板/桌面：恢复固定尺寸 `sm:w-[580px] sm:h-[520px]` + 居中 + 圆角

```
桌面 (sm+):                    手机 (<sm):
┌────────────────────────┐     ┌──────────────────────┐
│      ┌──────────┐      │     │ 设置                 │
│      │  设置    │      │     ├──────────────────────┤
│      │ 580x520  │      │     │ [Tab1][Tab2][Tab3]→ │ ← 水平滚动
│      │          │      │     ├──────────────────────┤
│      └──────────┘      │     │  内容 (全宽)         │
└────────────────────────┘     └──────────────────────┘
```

具体：`w-[580px] h-[520px]` → `w-full h-full sm:w-[580px] sm:h-[520px] sm:rounded-md`，外层遮罩从 `p-4` 改为 `p-0 sm:p-4`。

**断点说明**：SettingsModal 用 `sm:`（640px）而非 `md:`（768px）恢复桌面布局，因为 580px 模态框在 640px 屏上能完整放下。而 HistorySidebar 和 AdminPage 侧边栏需要更多常驻空间，用 `md:`（768px）恢复。

#### 内部左侧导航栏（第 391 行 `w-[130px]`）
- 手机：导航改为顶部水平 Tab 栏（`flex-row overflow-x-auto`），宽度自适应
- 平板/桌面：恢复左侧 130px 垂直导航

```
桌面:                              手机:
┌─────┬─────────────┐              ┌──────────────────────┐
│ Tab │  内容       │              │ [Tab1][Tab2][Tab3]→ │
│ Tab │             │              ├──────────────────────┤
│ Tab │             │              │  内容 (全宽)         │
└─────┴─────────────┘              └──────────────────────┘
```

具体：
- 导航容器 `w-[130px] flex-shrink-0 flex-col` → `flex flex-row overflow-x-auto sm:flex-col sm:w-[130px] sm:flex-shrink-0`
- Tab 项加 `shrink-0` 防压缩
- 导航与内容区的 `flex` 布局从 `flex-row` 改为 `flex-col sm:flex-row`

#### 关闭按钮
确保关闭按钮（右上角 ×）在手机全屏模式下仍可点击——固定在右上角，`z-index` 高于内容。

### 3.9 AdminPage 与 Admin 子组件

#### AdminPage 主框架（[AdminPage.jsx](file:///workspace/frontend/src/pages/AdminPage.jsx) 第 27-28 行）
现状 `h-screen flex` + 固定 `w-56`（224px）侧边栏 + `flex-1` 主内容。

方案：移动端汉堡 + 抽屉式侧边栏。
- 手机（`<md`）：侧边栏 `fixed left-0 top-0 h-full z-50 -translate-x-full`（默认隐藏），汉堡按钮（`md:hidden`）放主内容区顶部，点击切换 `translate-x-0` + 遮罩
- 平板/桌面（`md+`）：恢复常驻 `w-56` 侧边栏

```
桌面 (md+):                      手机 (<md):
┌──────┬──────────────┐          ┌──────────────────────┐
│ 侧   │ [☰] 顶栏     │          │ [☰] Admin  顶栏      │
│ 边   ├──────────────┤          ├──────────────────────┤
│ 栏   │              │          │                      │
│ 224  │  主内容      │          │  主内容 (全宽)       │
│ px   │  max-w-6xl   │          │                      │
│      │              │          │                      │
└──────┴──────────────┘          └──────────────────────┘
                                 点击☰ →
                                 ┌──────┬─────────────┐
                                 │侧边栏│  (遮罩)     │
                                 │ 224  │             │
                                 └──────┴─────────────┘
```

#### AdminUsers 用户表格 → 卡片列表（[AdminUsers.jsx](file:///workspace/frontend/src/components/AdminUsers.jsx) 第 168 行）
现状 8 列表格（复选框/邮箱/名称/Tier/额度/状态/注册时间/操作）。

方案：
- 手机：表格转为卡片列表，每个用户一张卡片，字段纵向堆叠
- 平板/桌面：恢复表格

```
桌面 (md+):                      手机 (<md):
┌──┬─────┬────┬───┬───┬───┬───┬──┐   ┌────────────────────┐
│☐│邮箱 │名称│Tie│额度│状态│时间│操│   │ ☐ user@email.com   │
├──┼─────┼────┼───┼───┼───┼───┼──┤   │ 名称 · Tier · 状态 │
│  │     │    │   │   │   │   │  │   │ 额度 · 注册时间    │
└──┴─────┴────┴───┴───┴───┴───┴──┘   │ [编辑] [详情]      │
                                    └────────────────────┘
```

具体：
- 表格容器 `hidden md:block`
- 卡片列表 `md:hidden space-y-3`，每个卡片 `card-warm p-4`
- 卡片内：邮箱（粗体）、名称/Tier/状态（一行 badge）、额度/注册时间（一行）、操作按钮（底部 flex）
- 复选框放卡片左上角

#### AdminCosts 成本表格（[AdminCosts.jsx](file:///workspace/frontend/src/components/AdminCosts.jsx)）
- 第 136 行 3 列（模型/Tokens/成本）：窄表格，加 `overflow-x-auto` 即可
- 第 168 行 5 列（用户/输入/输出/句子数/成本）：手机上转卡片列表（同 AdminUsers 模式）
- 第 108 行 `grid grid-cols-2 lg:grid-cols-4` + 第 133 行 `grid grid-cols-1 lg:grid-cols-2`：已有响应式，保持

#### AdminGlobalVocab 全局词汇表（[AdminGlobalVocab.jsx](file:///workspace/frontend/src/components/AdminGlobalVocab.jsx)）
- 第 389 行表格 + `max-w-[300px]` 单元格：加 `overflow-x-auto` 包裹
- 第 310 行 `grid grid-cols-2 sm:grid-cols-4`：已有响应式，保持
- 第 343 行 `min-w-[200px]`（筛选下拉）→ `w-full sm:w-auto sm:min-w-[200px]`（手机全宽）

#### AdminApiKeys 模态框（[AdminApiKeys.jsx](file:///workspace/frontend/src/components/AdminApiKeys.jsx)）
三个固定宽度模态框：
- 第 447 行 `w-[480px]` → `w-full max-w-[480px] sm:mx-4`
- 第 503 行 `w-[480px]` → `w-full max-w-[480px] sm:mx-4`
- 第 584 行 `w-[420px]` → `w-full max-w-[420px] sm:mx-4`

外层遮罩加 `p-0 sm:p-4`，模态框加 `sm:rounded-md`。

#### AdminDashboard / AdminUserDetail
- [AdminDashboard.jsx](file:///workspace/frontend/src/components/AdminDashboard.jsx) 第 135 行 `grid grid-cols-2 lg:grid-cols-4` + 第 161 行 `grid grid-cols-1 lg:grid-cols-3`：已有响应式，保持
- [AdminUserDetail.jsx](file:///workspace/frontend/src/components/AdminUserDetail.jsx) 第 51/90 行 `grid grid-cols-1 lg:grid-cols-2`：已有响应式，保持

## 4. 错误处理与边界情况

### 4.1 抽屉状态与路由切换
- HistorySidebar 抽屉展开时，若用户导航到其他会话，抽屉应自动收起。在会话点击 handler 里 `setSidebarOpen(false)`
- AdminPage 侧边栏同理：导航项点击后收起
- 抽屉展开时按 ESC 键收起（无障碍）

### 4.2 横向滑动 snap 的边界
- DictionaryStep 横向滑动：用 `onScroll` 计算 `Math.round(scrollLeft / clientWidth)` 得到当前栏索引。需 debounce 避免频繁 setState。指示器圆点根据该索引高亮
- 滑动到边界时不应出现回弹异常——`scroll-snap-type: x mandatory` + 子项 `w-full shrink-0` 已能保证

### 4.3 全屏模态的滚动锁定
SettingsModal 在手机上全屏时，背景不应滚动。模态打开时给 `body` 加 `overflow-hidden`，关闭时移除。用 `useEffect` 监听 `isOpen`。

### 4.4 触摸目标尺寸
移动端可点击元素最小 44x44px（Apple HIG）/ 48x48px（Material）。检查：
- 上下文菜单项、Tab 项、分页按钮（`min-w-[22px]`）——装饰性小元素或已有足够 padding 的按钮，实际触摸区通常够
- 汉堡按钮：设为 `w-10 h-10`（40px），略小于 44 但可接受
- 抽屉中的会话项：保持现有 padding（应已够大）

## 5. 测试策略

由于项目无端到端测试框架（`package.json` 无 jest/vitest/playwright），采用手动验证 + 响应式断点审查。

### 5.1 手动验证清单（按断点）
- **320px（iPhone SE）**：所有页面无横向溢出、模态全屏、抽屉可用
- **375px（iPhone 12）**：同上
- **768px（iPad）**：双栏恢复、侧边栏常驻、表格显示
- **1024px（iPad Landscape / 小桌面）**：桌面布局完整

### 5.2 关键路径验证
- **LandingPage**：汉堡菜单展开/收起、点击导航项跳转
- **LearningApp**：抽屉滑入/滑出、选择会话后自动收起、学习步骤内容可滚动
- **DictionaryStep**：横向滑动切换两栏、圆点指示器同步
- **AdminUsers**：表格（md+）/卡片（<md）切换显示正确
- **SettingsModal**：手机全屏 + 顶部 Tab、桌面固定尺寸 + 左侧导航

## 6. 实现顺序

按依赖关系从底层到上层：

1. 全局基础：`useMediaQuery` hook、`.touch-scroll-x`/`.mobile-drawer-overlay`/`.snap-item` CSS 工具类
2. LearningApp 主容器 + HistorySidebar 抽屉（其他组件依赖此布局）
3. DictionaryStep 横向滑动
4. 题目类组件 + LearningStep（共性调整，批量改）
5. SettingsModal 全屏适配
6. AllUnitsStep 等其他学习步骤
7. AdminPage 框架 + AdminUsers 卡片 + 其他 Admin 组件
8. LandingPage 汉堡菜单
9. LoginPage 背景动画优化
10. 全断点手动验证

## 7. 不在本次范围内

- 不引入新的 UI 库或 CSS 框架（如 Container Queries、styled-components）
- 不重构现有组件结构（仅在现有组件上加响应式断点）
- 不优化桌面端布局（lg+ 保持现状）
- 不处理 PWA / 离线支持
- 不做性能优化（除 LoginPage 背景动画对齐 LandingPage 的移动端降帧）
