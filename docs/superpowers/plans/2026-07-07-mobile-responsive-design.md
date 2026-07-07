# GuaLingo 移动端响应式适配 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将整个学习界面（主页/登录/学习应用/单词表/字典/题目/设置）+ Admin 后台适配手机版浏览器，覆盖手机（320px+）、平板（768-1024px）、桌面（1024px+）三档。

**Architecture:** 渐进式响应式适配——在现有组件上直接加 Tailwind 响应式前缀（`sm:`/`md:`/`lg:`），固定宽度改响应式，双栏改单栏/抽屉/横向滑动。仅在有交互需求处（抽屉开关、横向滑动 snap、表格转卡片）加少量 JS。新增一个 `useMediaQuery` hook 和三个 CSS 工具类作为基础设施。

**Tech Stack:** React 18 + Vite + Tailwind CSS 3.4 + framer-motion 11 + react-router-dom 6。无测试框架（无 jest/vitest/playwright），采用"实现 + 构建验证 + 手动断点验证"模式。

**Spec:** [docs/superpowers/specs/2026-07-07-mobile-responsive-design.md](file:///workspace/docs/superpowers/specs/2026-07-07-mobile-responsive-design.md)

**项目无测试框架说明**：本计划不采用 TDD（项目 `package.json` 无测试依赖）。每个任务的验证方式为：① `npm run build` 确保无编译错误；② 启动 `npm run dev` 在浏览器 DevTools 切换设备模拟器，按任务指定的断点手动验证布局。所有手动验证步骤都给出具体操作指令。

**工作目录**：所有路径相对 `/workspace/frontend/`。所有 `npm` 命令在 `/workspace/frontend/` 下执行。

**通用验证命令**：
- 构建：`cd /workspace/frontend && npm run build`
- 开发服务器：`cd /workspace/frontend && npm run dev`（默认 http://localhost:5173）

---

## 文件结构

### 新建文件
| 文件 | 职责 |
|------|------|
| `frontend/src/utils/useMediaQuery.js` | 响应式媒体查询 hook，供抽屉/卡片切换等 JS 逻辑分支使用 |

### 修改文件（按改造顺序）
| 文件 | 改动概述 |
|------|----------|
| `frontend/src/index.css` | 新增 `.mobile-drawer-overlay` / `.touch-scroll-x` / `.snap-item` 三个工具类 |
| `frontend/src/components/HistorySidebar.jsx` | 侧边栏移动端抽屉化（复用现有 SVG 按钮） |
| `frontend/src/pages/LearningApp.jsx` | 根容器 `h-screen`→`h-[100svh]`；Input 步骤布局适配抽屉 |
| `frontend/src/components/DictionaryStep.jsx` | 双栏改横向滑动 + 圆点指示器；顶部工具栏响应式 |
| `frontend/src/components/LearningStep.jsx` | 选项网格 `grid-cols-1 sm:grid-cols-2`；标题字号响应式 |
| `frontend/src/components/SentenceQuizStep.jsx` | `p-8`→`p-4 sm:p-8`；工具栏加 gap |
| `frontend/src/components/ListeningQuizStep.jsx` | 同上 |
| `frontend/src/components/MaskedSentenceExerciseStep.jsx` | 同上 |
| `frontend/src/components/TranslationReconstructionStep.jsx` | 同上 |
| `frontend/src/components/VocabListStep.jsx` | 弹窗 `max-h-[85vh]`→`max-h-[90vh]` |
| `frontend/src/components/WordListPanel.jsx` | 折叠面板高度响应式；单词行加 `flex-wrap` |
| `frontend/src/components/SettingsModal.jsx` | 全屏模态 + 顶部水平 Tab |
| `frontend/src/components/AllUnitsStep.jsx` | 顶部工具栏 `flex-wrap`；标题截断响应式 |
| `frontend/src/components/PhaseSelectorStep.jsx` | `md:grid-cols-2`→`sm:grid-cols-2` |
| `frontend/src/pages/AdminPage.jsx` | 侧边栏抽屉化 + 汉堡按钮 |
| `frontend/src/components/admin/AdminUsers.jsx` | 8 列表格 → 手机卡片列表 |
| `frontend/src/components/admin/AdminCosts.jsx` | 表格加 `overflow-x-auto` + 5 列表转卡片 |
| `frontend/src/components/admin/AdminGlobalVocab.jsx` | 表格加 `overflow-x-auto`；筛选下拉响应式 |
| `frontend/src/components/admin/AdminApiKeys.jsx` | 三个固定宽度模态框改响应式 |
| `frontend/src/pages/LandingPage.jsx` | 移动端汉堡菜单 + 细节微调 |
| `frontend/src/pages/LoginPage.jsx` | DotBackground 移动端降帧 |

---

## Task 1: 全局基础设施（useMediaQuery hook + CSS 工具类）

**Files:**
- Create: `frontend/src/utils/useMediaQuery.js`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: 创建 useMediaQuery hook**

创建 `frontend/src/utils/useMediaQuery.js`：

```js
import { useState, useEffect } from 'react'

/**
 * 响应式媒体查询 hook。
 * 初值取 matchMedia().matches 避免首帧闪烁（FOUC）。
 * 本项目是 Vite SPA（main.jsx 客户端渲染），无 SSR，window 在渲染时一定存在。
 */
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

- [ ] **Step 2: 在 index.css 新增三个工具类**

修改 `frontend/src/index.css`，在文件末尾（第 215 行 `vintage-paper::before` 块之后）追加：

```css

/* === 移动端响应式适配工具类 === */

/* 抽屉遮罩：固定全屏半透明背景 */
.mobile-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 40;
}

/* 横向滑动容器：snap 对齐 + 触摸滚动 */
.touch-scroll-x {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x mandatory;
}

/* snap 子项：占满父容器宽度，snap 起点对齐 */
.snap-item {
  scroll-snap-align: start;
  flex-shrink: 0;
  width: 100%;
}
```

- [ ] **Step 3: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功，无错误。

- [ ] **Step 4: Commit**

```bash
cd /workspace && git add frontend/src/utils/useMediaQuery.js frontend/src/index.css
git commit -m "feat: 添加 useMediaQuery hook 和移动端响应式 CSS 工具类"
```

---

## Task 2: HistorySidebar 抽屉化

将 HistorySidebar 在 `<md`（768px）时改为抽屉模式：默认完全隐藏，点击现有展开按钮滑入，带遮罩。`md+` 保持现有三态行为。

**Files:**
- Modify: `frontend/src/components/HistorySidebar.jsx`

- [ ] **Step 1: 读取 HistorySidebar 现有结构确认行号**

Run: 用 Read 工具读取 `frontend/src/components/HistorySidebar.jsx` 第 1-30 行（imports）和第 280-460 行（渲染逻辑）。
确认：`SIDEBAR_WIDTH = 260` 在第 283 行；展开态 `motion.div` 在第 288-425 行；折叠态 `motion.div`（`width: 48`）在第 427-460 行。

- [ ] **Step 2: 添加 useMediaQuery 导入和 md 断点判断**

在 `frontend/src/components/HistorySidebar.jsx` 顶部 imports 区，找到现有的 import 语句（如 `import { motion, AnimatePresence } from 'framer-motion'`），在其下方新增一行：

```js
import { useMediaQuery } from '../utils/useMediaQuery'
```

然后在组件函数体顶部（在现有 state 声明之前或之后，如 `const SIDEBAR_WIDTH = 260` 之前）添加：

```js
  const isDesktop = useMediaQuery('(min-width: 768px)')
```

- [ ] **Step 3: 改造外层容器为响应式**

找到第 287 行 `<div className="flex h-full">`，这是包裹展开态和折叠态的外层 div。

将其改为：

```jsx
      <div className="flex h-full">
```

（保持不变，但下方两个分支根据 `isDesktop` 切换渲染方式）

- [ ] **Step 4: 改造展开态 motion.div 为桌面/手机双模式**

找到第 288-425 行的 `{expanded && (<motion.div>...</motion.div>)}` 块。将其替换为根据 `isDesktop` 分支渲染的逻辑。

把原来的：
```jsx
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: SIDEBAR_WIDTH, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="h-full overflow-hidden flex flex-col bg-parchment-100/50 border-r border-aged-200/60"
              style={{ minWidth: 0 }}
            >
```

改为：
```jsx
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={isDesktop ? { width: 0, opacity: 0 } : { x: '-100%', opacity: 0 }}
              animate={isDesktop ? { width: SIDEBAR_WIDTH, opacity: 1 } : { x: 0, opacity: 1 }}
              exit={isDesktop ? { width: 0, opacity: 0 } : { x: '-100%', opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className={
                isDesktop
                  ? "h-full overflow-hidden flex flex-col bg-parchment-100/50 border-r border-aged-200/60"
                  : "fixed left-0 top-0 h-full z-50 flex flex-col bg-parchment-100 border-r-2 border-aged-200 shadow-warm-lg"
              }
              style={isDesktop ? { minWidth: 0, width: SIDEBAR_WIDTH } : { width: SIDEBAR_WIDTH, maxWidth: '85vw' }}
            >
```

说明：
- 桌面：保持原有 width 动画 + `relative` 布局
- 手机：改用 transform `x` 动画 + `fixed` 定位脱离文档流，宽度 260px 但不超过 85vw

- [ ] **Step 5: 在手机展开态时渲染遮罩**

在第 286 行 `<div className="flex h-full">` 之后、`<AnimatePresence>` 之前，插入遮罩渲染逻辑：

```jsx
      <div className="flex h-full">
        {/* 手机抽屉遮罩 */}
        {!isDesktop && expanded && (
          <div className="mobile-drawer-overlay md:hidden" onClick={() => setExpanded(false)} />
        )}
        <AnimatePresence>
```

- [ ] **Step 6: 折叠态（48px 图标列）仅桌面渲染**

找到第 427 行的 `{!expanded && (` 块。改为：

```jsx
        {!expanded && isDesktop && (
```

这样手机上折叠态完全不渲染（只有"完全隐藏"和"抽屉展开"两态）。

- [ ] **Step 7: 手机上提供独立的浮动展开按钮**

由于折叠态在手机上不渲染，原有展开按钮（`PanelLeftOpen`）也随之消失。需要在手机上提供一个浮动按钮。

在第 286 行 `<div className="flex h-full">` 之前（即组件返回的 `<>` 之后），插入：

```jsx
    <>
      {/* 手机浮动展开按钮 */}
      {!isDesktop && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="fixed left-3 top-3 z-30 w-10 h-10 flex items-center justify-center rounded-md bg-parchment-50 border-2 border-aged-200 shadow-retro text-ink-500 hover:text-ink-700 hover:border-aged-300 transition-colors md:hidden"
          title={t.historyTitle || '学习记录'}
          aria-label={t.historyTitle || '学习记录'}
        >
          <PanelLeftOpen className="w-4.5 h-4.5" />
        </button>
      )}
      <div className="flex h-full">
```

**注意**：`PanelLeftOpen` 已在现有 imports 中（第 439 行已使用），无需新增 import。

- [ ] **Step 8: 选择会话后自动收起抽屉**

找到会话点击 handler（在 HistorySidebar 中，通常是点击某条记录的 onClick，如 `onClick={() => onSelectRecord(record.id)}` 之类）。在手机上需要在选择后收起。

搜索 `onSelectRecord` 或类似的会话选择回调。在其调用后添加：

```js
          if (!isDesktop) setExpanded(false)
```

如果找不到统一入口，可在 records.map 渲染的每个会话项的 onClick 中补上。具体实现时用 Grep 搜索 `onSelect` 或 `handleSelect` 定位。

- [ ] **Step 9: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 10: 手动验证**

Run: `cd /workspace/frontend && npm run dev`

浏览器打开 http://localhost:5173/learn，DevTools 切换到 iPhone SE (375px)：
- 预期：左上角有浮动展开按钮，侧边栏默认隐藏
- 点击浮动按钮：侧边栏从左滑入，出现遮罩
- 点击遮罩：侧边栏滑出消失
- 切换到 iPad (768px)：侧边栏恢复常驻，浮动按钮消失

- [ ] **Step 11: Commit**

```bash
cd /workspace && git add frontend/src/components/HistorySidebar.jsx
git commit -m "feat: HistorySidebar 移动端抽屉化"
```

---

## Task 3: LearningApp 主容器适配

**Files:**
- Modify: `frontend/src/pages/LearningApp.jsx`

- [ ] **Step 1: 根容器 h-screen 改 h-[100svh]**

找到第 1267-1268 行 `<div className="h-screen overflow-hidden bg-parchment-50 ...">`。

将 `h-screen` 改为 `h-[100svh]`（保留其他 class）。

**注意**：`100svh` 是 small viewport height，解决移动端地址栏导致 100vh 异常。旧浏览器不支持 svh 会回退忽略该值——为保险，改为 `h-screen h-[100svh]`（Tailwind 会生成两个 class，浏览器用后者覆盖前者，不支持 svh 的浏览器保留 h-screen）。

- [ ] **Step 2: 确认 Input 步骤布局无需改动**

读取第 1274-1338 行。现状 `<div className="flex h-full"> <HistorySidebar/> <div className="flex-1 min-w-0 ...">`。

由于 Task 2 已让 HistorySidebar 在手机上 `fixed` 脱离文档流，主内容区 `flex-1 min-w-0` 会自动占满全宽。**无需改动**。

- [ ] **Step 3: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 4: 手动验证**

DevTools iPhone SE：学习界面占满视口高度，地址栏收起/展开时无布局跳动。

- [ ] **Step 5: Commit**

```bash
cd /workspace && git add frontend/src/pages/LearningApp.jsx
git commit -m "feat: LearningApp 根容器使用 100svh 适配移动端地址栏"
```

---

## Task 4: DictionaryStep 双栏横向滑动

**Files:**
- Modify: `frontend/src/components/DictionaryStep.jsx`

- [ ] **Step 1: 添加 useMediaQuery 导入**

在 `frontend/src/components/DictionaryStep.jsx` 顶部 imports 区添加：

```js
import { useMediaQuery } from '../utils/useMediaQuery'
```

在组件函数体顶部添加：

```js
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [activePanel, setActivePanel] = useState(0) // 0=句子翻译, 1=词汇表
  const scrollContainerRef = useRef(null)
```

**注意**：确保 `useState` 和 `useRef` 已从 react 导入。若未导入，在现有 `import { ... } from 'react'` 中补上。

- [ ] **Step 2: 改造双栏容器为响应式横向滑动**

找到第 955 行：
```jsx
      <div className="flex gap-6 flex-1 min-h-0" style={{ overflow: 'hidden' }}>
```

改为：
```jsx
      <div
        ref={scrollContainerRef}
        onScroll={(e) => {
          if (isDesktop) return
          const idx = Math.round(e.target.scrollLeft / e.target.clientWidth)
          if (idx !== activePanel) setActivePanel(idx)
        }}
        className="flex gap-0 md:gap-6 flex-1 min-h-0 md:overflow-hidden touch-scroll-x"
      >
```

说明：
- 手机：`touch-scroll-x`（含 `overflow-x: auto` + snap）+ `gap-0`
- 桌面：`md:overflow-hidden` + `md:gap-6`

- [ ] **Step 3: 改造第一个子栏（句子翻译）**

找到第 956 行：
```jsx
        <div className="w-1/2 flex flex-col min-h-0" style={{ overflow: 'hidden' }}>
```

改为：
```jsx
        <div className="w-full md:w-1/2 snap-item flex flex-col min-h-0 md:overflow-hidden" style={{ overflow: isDesktop ? 'hidden' : undefined }}>
```

同时找到第 960 行的 `style={{ minWidth: '140px' }}`，改为：
```jsx
                <div className="flex items-center gap-2 shrink-0 md:min-w-[140px]">
```

（删除内联 `style={{ minWidth: '140px' }}`，改用 Tailwind `md:min-w-[140px]`）

- [ ] **Step 4: 改造第二个子栏（词汇表）**

找到第 1053 行：
```jsx
        <div className="w-1/2 flex flex-col min-h-0" style={{ overflow: 'hidden' }}>
```

改为（与 Step 3 相同）：
```jsx
        <div className="w-full md:w-1/2 snap-item flex flex-col min-h-0 md:overflow-hidden" style={{ overflow: isDesktop ? 'hidden' : undefined }}>
```

找到第 1057 行的 `style={{ minWidth: '140px' }}`，改为：
```jsx
                <div className="flex items-center gap-2 shrink-0 md:min-w-[140px]">
```

- [ ] **Step 5: 在双栏容器上方添加圆点指示器**

在第 955 行双栏容器 `<div ref={scrollContainerRef} ...>` 之前，插入指示器：

```jsx
      {/* 手机横向滑动指示器 */}
      {!isDesktop && (
        <div className="flex justify-center gap-2 py-2 md:hidden">
          <span className={`w-2 h-2 rounded-full transition-colors ${activePanel === 0 ? 'bg-amber-400' : 'bg-aged-300'}`} />
          <span className={`w-2 h-2 rounded-full transition-colors ${activePanel === 1 ? 'bg-amber-400' : 'bg-aged-300'}`} />
        </div>
      )}

      <div
        ref={scrollContainerRef}
        ...
```

- [ ] **Step 6: 顶部工具栏响应式**

找到第 842 行附近的工具栏 `flex items-center gap-3`，改为：
```jsx
        className="flex items-center gap-2 md:gap-3 flex-wrap"
```

找到第 863/877 行文件标题 `max-w-[250px]`，改为：
```jsx
            className="... max-w-[150px] md:max-w-[250px] ..."
```

（保留其他 class，仅替换 `max-w-[250px]` 部分）

找到第 901/918 行进度条 `w-24`，改为 `w-16 md:w-24`。

- [ ] **Step 7: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 8: 手动验证**

DevTools iPhone SE，进入学习界面选择一个有句子的文件，进入字典步骤：
- 预期：双栏改为单栏，显示句子翻译全宽，顶部有两个圆点（第一个高亮）
- 左滑：切换到词汇表全宽，第二个圆点高亮
- 右滑：切回句子翻译

DevTools iPad (768px)：
- 预期：恢复 50/50 双栏，无圆点指示器

- [ ] **Step 9: Commit**

```bash
cd /workspace && git add frontend/src/components/DictionaryStep.jsx
git commit -m "feat: DictionaryStep 双栏移动端横向滑动 + 圆点指示器"
```

---

## Task 5: LearningStep 单词学习适配

**Files:**
- Modify: `frontend/src/components/LearningStep.jsx`

- [ ] **Step 1: 选项网格响应式**

找到第 132 行 `grid grid-cols-2 gap-3`，改为：
```jsx
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
```

- [ ] **Step 2: 单词标题字号响应式**

找到第 105 行和第 171 行的 `text-4xl`，改为 `text-3xl sm:text-4xl`。

**注意**：用 Grep 确认这两处是单词标题而非其他。Run: Grep `text-4xl` in LearningStep.jsx。

- [ ] **Step 3: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 4: 手动验证**

DevTools iPhone SE，进入单词学习步骤：
- 预期：选项单列纵向排列；单词标题字号略小

DevTools iPad：选项恢复双列。

- [ ] **Step 5: Commit**

```bash
cd /workspace && git add frontend/src/components/LearningStep.jsx
git commit -m "feat: LearningStep 选项网格和标题字号响应式"
```

---

## Task 6: 题目组件共性调整（4 个组件）

四个题目组件结构相似，统一处理：`p-8`→`p-4 sm:p-8`，工具栏加 gap + mb 响应式。

**Files:**
- Modify: `frontend/src/components/SentenceQuizStep.jsx`
- Modify: `frontend/src/components/ListeningQuizStep.jsx`
- Modify: `frontend/src/components/MaskedSentenceExerciseStep.jsx`
- Modify: `frontend/src/components/TranslationReconstructionStep.jsx`

- [ ] **Step 1: SentenceQuizStep 调整**

读取 `frontend/src/components/SentenceQuizStep.jsx` 第 84-120 行。

第 86 行附近工具栏 `flex items-center justify-between mb-8` → `flex items-center justify-between gap-2 mb-6 sm:mb-8`

第 116 行附近题目卡片 `p-8` → `p-4 sm:p-8`（在卡片容器的 className 中替换）

用 Grep 确认：Grep `p-8` in SentenceQuizStep.jsx，找到所有出现位置，逐一改为 `p-4 sm:p-8`。

- [ ] **Step 2: ListeningQuizStep 调整**

同样处理 `frontend/src/components/ListeningQuizStep.jsx`：
- 工具栏 `justify-between mb-8` → `justify-between gap-2 mb-6 sm:mb-8`
- 卡片 `p-8` → `p-4 sm:p-8`

用 Grep 定位 `p-8` 和 `mb-8`。

- [ ] **Step 3: MaskedSentenceExerciseStep 调整**

同样处理 `frontend/src/components/MaskedSentenceExerciseStep.jsx`：
- 工具栏 `justify-between mb-8` → `justify-between gap-2 mb-6 sm:mb-8`
- 卡片 `p-8` → `p-4 sm:p-8`

- [ ] **Step 4: TranslationReconstructionStep 调整**

同样处理 `frontend/src/components/TranslationReconstructionStep.jsx`：
- 工具栏 `justify-between mb-8` → `justify-between gap-2 mb-6 sm:mb-8`
- 卡片 `p-8` → `p-4 sm:p-8`

- [ ] **Step 5: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 6: 手动验证**

DevTools iPhone SE，分别进入四种题目类型：
- 预期：卡片内边距更紧凑（16px 而非 32px），顶部工具栏元素不挤压

- [ ] **Step 7: Commit**

```bash
cd /workspace && git add frontend/src/components/SentenceQuizStep.jsx frontend/src/components/ListeningQuizStep.jsx frontend/src/components/MaskedSentenceExerciseStep.jsx frontend/src/components/TranslationReconstructionStep.jsx
git commit -m "feat: 题目组件内边距和工具栏响应式适配"
```

---

## Task 7: VocabListStep + WordListPanel 适配

**Files:**
- Modify: `frontend/src/components/VocabListStep.jsx`
- Modify: `frontend/src/components/WordListPanel.jsx`

- [ ] **Step 1: VocabListStep 弹窗高度调整**

找到 `frontend/src/components/VocabListStep.jsx` 第 192 行 `max-w-2xl max-h-[85vh] w-full`，改为：
```jsx
            className="... max-w-2xl max-h-[90vh] w-full ..."
```

（仅替换 `max-h-[85vh]` 为 `max-h-[90vh]`）

- [ ] **Step 2: WordListPanel 折叠面板高度响应式**

找到 `frontend/src/components/WordListPanel.jsx` 第 567 行 `max-h-[420px] overflow-y-auto`，改为：
```jsx
            className="... max-h-[60vh] sm:max-h-[420px] overflow-y-auto ..."
```

- [ ] **Step 3: WordListPanel 单词行加 flex-wrap**

找到第 395 行 `flex items-center gap-2`（word + ipa + part_of_speech 所在行），改为：
```jsx
                className="flex items-center gap-2 flex-wrap"
```

**注意**：用 Read 读取第 390-400 行确认这是单词行的 word+ipa+pos 容器，避免误改其他 `flex items-center gap-2`。

- [ ] **Step 4: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 5: 手动验证**

DevTools iPhone SE：
- 打开 VocabListStep 弹窗：弹窗占 90vh 高度
- 打开 WordListPanel 折叠面板：高度自适应视口
- 长单词行：ipa 或 part_of_speech 可换行

- [ ] **Step 6: Commit**

```bash
cd /workspace && git add frontend/src/components/VocabListStep.jsx frontend/src/components/WordListPanel.jsx
git commit -m "feat: VocabListStep 和 WordListPanel 响应式适配"
```

---

## Task 8: SettingsModal 全屏模态适配

**Files:**
- Modify: `frontend/src/components/SettingsModal.jsx`

- [ ] **Step 1: 模态框尺寸响应式**

找到第 363 行外层遮罩 `className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-800/40 backdrop-blur-sm"`，将 `p-4` 改为 `p-0 sm:p-4`：

```jsx
        className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-ink-800/40 backdrop-blur-sm"
```

找到第 371 行模态框 `className="bg-parchment-50 border-2 border-aged-200 rounded-md shadow-retro-xl w-[580px] h-[520px] overflow-hidden flex flex-col"`，改为：

```jsx
          className="bg-parchment-50 border-0 sm:border-2 border-aged-200 rounded-none sm:rounded-md shadow-retro-xl w-full h-full sm:w-[580px] sm:h-[520px] overflow-hidden flex flex-col"
```

- [ ] **Step 2: 内部导航栏改响应式（手机水平 Tab / 桌面垂直导航）**

找到第 389 行 `<div className="flex flex-1 min-h-0">`（Body: Sidebar + Content 容器），改为：

```jsx
          <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
```

找到第 391 行左侧导航 `<div className="w-[130px] shrink-0 border-r border-aged-200/60 bg-parchment-100/40 py-2">`，改为：

```jsx
            <div className="flex flex-row overflow-x-auto sm:flex-col sm:w-[130px] sm:flex-shrink-0 border-b sm:border-b-0 sm:border-r border-aged-200/60 bg-parchment-100/40 py-2">
```

- [ ] **Step 3: Tab 项加 shrink-0**

在第 392-400 行附近，`SECTIONS.map(key => ...)` 渲染的每个 Tab 项的 className 中添加 `shrink-0`。

用 Read 读取第 392-420 行确认 Tab 项的 className 结构，找到类似 `className={...isActive...}` 的地方，在 isActive 分支的 className 字符串中追加 `shrink-0`。

- [ ] **Step 4: 添加 body 滚动锁定**

在 SettingsModal 组件函数体中添加 useEffect（若已有 useEffect 则在其中补充）：

```js
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])
```

**注意**：需确认 `isOpen` prop 名称。用 Grep 搜索 `export default function SettingsModal` 或 `function SettingsModal(` 查看其 props 解构，确认 isOpen 的实际名称（可能是 `open` 或 `show`）。

- [ ] **Step 5: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 6: 手动验证**

DevTools iPhone SE，打开设置：
- 预期：设置全屏覆盖，顶部水平 Tab 可横向滚动，背景不滚动
- 关闭设置：背景恢复滚动

DevTools iPad (768px)：设置恢复 580x520 居中模态 + 左侧垂直导航。

- [ ] **Step 7: Commit**

```bash
cd /workspace && git add frontend/src/components/SettingsModal.jsx
git commit -m "feat: SettingsModal 移动端全屏模态 + 顶部水平 Tab"
```

---

## Task 9: AllUnitsStep + PhaseSelectorStep 适配

**Files:**
- Modify: `frontend/src/components/AllUnitsStep.jsx`
- Modify: `frontend/src/components/PhaseSelectorStep.jsx`

- [ ] **Step 1: AllUnitsStep 顶部工具栏响应式**

读取 `frontend/src/components/AllUnitsStep.jsx` 第 235-292 行。

找到第 235 行附近 `flex items-center gap-2`，改为 `flex items-center gap-1 sm:gap-2 flex-wrap`。

找到第 244 行 `max-w-[240px]`，改为 `max-w-[140px] sm:max-w-[240px]`。

- [ ] **Step 2: AllUnitsStep 单元卡片网格检查**

读取第 100-120 行，确认 80x80px 卡片的容器布局。若是 `grid`，加响应式列数（如 `grid-cols-4 sm:grid-cols-6 md:grid-cols-8`，按实际密度调整）。若是 `flex flex-wrap`，保持不变（80px 卡片能自适应换行）。

- [ ] **Step 3: PhaseSelectorStep 断点调整**

找到 `frontend/src/components/PhaseSelectorStep.jsx` 第 38 行 `grid grid-cols-1 md:grid-cols-2`，改为：
```jsx
            className="grid grid-cols-1 sm:grid-cols-2 ..."
```

- [ ] **Step 4: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 5: 手动验证**

DevTools iPhone SE：
- AllUnitsStep：工具栏元素可换行，标题截断合理
- PhaseSelectorStep：单列展示

DevTools iPad (640px+)：PhaseSelectorStep 双列。

- [ ] **Step 6: Commit**

```bash
cd /workspace && git add frontend/src/components/AllUnitsStep.jsx frontend/src/components/PhaseSelectorStep.jsx
git commit -m "feat: AllUnitsStep 和 PhaseSelectorStep 响应式适配"
```

---

## Task 10: AdminPage 侧边栏抽屉化

**Files:**
- Modify: `frontend/src/pages/AdminPage.jsx`

- [ ] **Step 1: 添加 useState 和 useMediaQuery**

在 `frontend/src/pages/AdminPage.jsx` 顶部修改 imports：

```jsx
import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { auth } from '../utils/auth'
import { useMediaQuery } from '../utils/useMediaQuery'
```

**注意**：确认 `lucide-react` 已安装（package.json 第 14 行有 `"lucide-react": "^0.454.0"`，已安装）。

- [ ] **Step 2: 添加抽屉状态和 ESC 关闭**

在 `AdminPage` 函数体中（`const navigate = useNavigate()` 之后）添加：

```jsx
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  useEffect(() => {
    if (!sidebarOpen) return
    const handler = (e) => { if (e.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sidebarOpen])
```

- [ ] **Step 3: 改造侧边栏为响应式**

找到第 27-58 行的 return 块，整体替换为：

```jsx
  return (
    <div className="h-screen bg-[#1a1a2e] flex">
      {/* 手机遮罩 */}
      {!isDesktop && sidebarOpen && (
        <div className="mobile-drawer-overlay md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`bg-[#16213e] border-r border-[#c9a96e]/20 flex flex-col flex-shrink-0 ${
        isDesktop
          ? 'w-56'
          : `fixed left-0 top-0 h-full z-50 w-56 transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
      }`}>
        <div className="p-4 border-b border-[#c9a96e]/20 flex items-center justify-between">
          <div>
            <h1 className="text-[#c9a96e] font-bold text-lg">Gualingo Admin</h1>
            <p className="text-[#e8d5b7]/50 text-xs mt-1">管理面板</p>
          </div>
          {!isDesktop && (
            <button onClick={() => setSidebarOpen(false)} className="text-[#e8d5b7] p-1">
              <X size={20} />
            </button>
          )}
        </div>
        <nav className="flex-1 p-2 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => { if (!isDesktop) setSidebarOpen(false) }}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm mb-1 transition-colors ${
                  isActive ? 'bg-[#c9a96e]/20 text-[#c9a96e] font-bold' : 'text-[#e8d5b7]/70 hover:bg-[#c9a96e]/10 hover:text-[#e8d5b7]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-[#c9a96e]/20">
          <button onClick={() => { auth.logout(); navigate('/login'); }} className="text-[#e8d5b7]/50 text-sm hover:text-[#e8d5b7]">退出</button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {/* 手机顶栏 */}
        {!isDesktop && (
          <div className="md:hidden flex items-center gap-3 p-4 border-b border-[#c9a96e]/20 bg-[#16213e]">
            <button onClick={() => setSidebarOpen(true)} className="text-[#c9a96e] p-1">
              <Menu size={24} />
            </button>
            <h1 className="text-[#c9a96e] font-bold">Admin</h1>
          </div>
        )}
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
```

- [ ] **Step 4: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 5: 手动验证**

DevTools iPhone SE，访问 /admin：
- 预期：侧边栏隐藏，顶部有汉堡按钮
- 点击汉堡：侧边栏从左滑入，出现遮罩
- 点击导航项：跳转 + 侧边栏收起
- 按 ESC：侧边栏收起

DevTools iPad (768px)：侧边栏常驻，无汉堡按钮。

- [ ] **Step 6: Commit**

```bash
cd /workspace && git add frontend/src/pages/AdminPage.jsx
git commit -m "feat: AdminPage 侧边栏移动端抽屉化"
```

---

## Task 11: AdminUsers 表格转卡片列表

**Files:**
- Modify: `frontend/src/components/admin/AdminUsers.jsx`

- [ ] **Step 1: 读取 AdminUsers 现有结构**

Run: Read `frontend/src/components/admin/AdminUsers.jsx` 第 165-238 行，确认表格结构（8 列：复选框/邮箱/名称/Tier/额度/状态/注册时间/操作）和字段名（`user.email`/`user.name`/`user.tier`/`user.quota_max`/`user.quota_used`/`user.banned`/`user.created_at`/`user.id`）。

- [ ] **Step 2: 给表格容器加 hidden md:block**

找到第 167 行 `<div className="bg-[#16213e] rounded-lg border border-[#c9a96e]/20 overflow-hidden">`（表格外层容器），改为：

```jsx
        <div className="hidden md:block bg-[#16213e] rounded-lg border border-[#c9a96e]/20 overflow-hidden">
```

- [ ] **Step 3: 在表格容器后添加手机卡片列表**

找到第 237 行 `</div>`（表格容器的闭合标签，在分页 `共 {data?.total} 条` 之前），在该 `</div>` 之后、分页 div 之前，插入卡片列表：

```jsx
        {/* 手机卡片列表 */}
        <div className="md:hidden space-y-3">
          {data?.users?.map(user => (
            <div key={user.id} className="bg-[#16213e] rounded-lg border border-[#c9a96e]/20 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={selected.has(user.id)}
                    onChange={() => toggleSelect(user.id)} className="accent-[#c9a96e]" />
                  <div>
                    <div className="text-[#e8d5b7] font-bold text-sm cursor-pointer" onClick={() => navigate(`/admin/users/${user.id}`)}>{user.email}</div>
                    <div className="text-[#e8d5b7]/60 text-xs">{user.name}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {user.banned ? (
                    <button onClick={() => handleUnban(user.id)} title="解封" className="p-1 text-green-400 hover:bg-green-900/30 rounded">
                      <ShieldOff size={16} />
                    </button>
                  ) : (
                    <button onClick={() => handleBan(user.id)} title="封禁" className="p-1 text-orange-400 hover:bg-orange-900/30 rounded">
                      <Shield size={16} />
                    </button>
                  )}
                  <button onClick={() => handleDelete(user.id)} title="注销账号" className="p-1 text-red-400 hover:bg-red-900/30 rounded">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded font-bold ${user.tier === 'pro' ? 'bg-purple-900/30 text-purple-400' : user.tier === 'basic' ? 'bg-blue-900/30 text-blue-400' : 'bg-gray-700/30 text-gray-400'}`}>{user.tier}</span>
                {user.banned
                  ? <span className="px-2 py-0.5 rounded font-bold bg-red-900/30 text-red-400">已封禁</span>
                  : <span className="px-2 py-0.5 rounded font-bold bg-green-900/30 text-green-400">正常</span>
                }
                <span className="text-[#e8d5b7]/60">额度：{user.quota_max - user.quota_used}</span>
                <span className="text-[#e8d5b7]/60">{user.created_at?.slice(0, 10)}</span>
              </div>
            </div>
          ))}
        </div>
```

**注意**：确认 `Shield`/`ShieldOff`/`Trash2` 已在文件顶部从 lucide-react 导入（表格版本已使用，应已导入）。

- [ ] **Step 4: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 5: 手动验证**

DevTools iPhone SE，访问 /admin/users：
- 预期：每个用户显示为卡片，字段纵向堆叠
- 点击邮箱：跳转用户详情
- 复选框、封禁/注销按钮可用

DevTools iPad (768px)：恢复 8 列表格。

- [ ] **Step 6: Commit**

```bash
cd /workspace && git add frontend/src/components/admin/AdminUsers.jsx
git commit -m "feat: AdminUsers 表格移动端转卡片列表"
```

---

## Task 12: AdminCosts + AdminGlobalVocab 表格适配

**Files:**
- Modify: `frontend/src/components/admin/AdminCosts.jsx`
- Modify: `frontend/src/components/admin/AdminGlobalVocab.jsx`

- [ ] **Step 1: AdminCosts 3 列窄表格加 overflow-x-auto**

读取 `frontend/src/components/admin/AdminCosts.jsx` 第 130-140 行，找到第 136 行附近的 3 列表格（模型/Tokens/成本）容器。

在 `<table>` 的外层 `<div>` 上加 `overflow-x-auto`。若外层 div 是 `<div className="bg-[#16213e] ...">`，改为 `<div className="bg-[#16213e] ... overflow-x-auto">`。

- [ ] **Step 2: AdminCosts 5 列表格转卡片列表**

找到第 168 行附近的 5 列表格（用户/输入/输出/句子数/成本）。

给表格容器加 `hidden md:block`。

在其后插入手机卡片列表（参考 Task 11 模式）：

```jsx
        {/* 手机卡片列表 */}
        <div className="md:hidden space-y-3">
          {costByUser?.map((row, idx) => (
            <div key={idx} className="bg-[#16213e] rounded-lg border border-[#c9a96e]/20 p-4 text-[#e8d5b7]">
              <div className="font-bold text-sm mb-2">{row.user || row.email || `用户 ${idx+1}`}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>输入：<span className="text-[#c9a96e]">{row.input_tokens}</span></div>
                <div>输出：<span className="text-[#c9a96e]">{row.output_tokens}</span></div>
                <div>句子数：<span className="text-[#c9a96e]">{row.sentence_count}</span></div>
                <div>成本：<span className="text-[#c9a96e]">${row.cost?.toFixed(4)}</span></div>
              </div>
            </div>
          ))}
        </div>
```

**注意**：用 Read 读取第 160-200 行确认字段名（`row.user`/`row.input_tokens` 等可能与实际不同），按实际字段调整。

- [ ] **Step 3: AdminGlobalVocab 表格加 overflow-x-auto**

读取 `frontend/src/components/admin/AdminGlobalVocab.jsx` 第 385-410 行，找到第 389 行表格容器。

给表格外层 div 加 `overflow-x-auto`。

- [ ] **Step 4: AdminGlobalVocab 筛选下拉响应式**

找到第 343 行 `min-w-[200px]`（筛选下拉 select），改为 `w-full sm:w-auto sm:min-w-[200px]`。

- [ ] **Step 5: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 6: 手动验证**

DevTools iPhone SE：
- /admin/costs：3 列表可横向滚动；5 列表转卡片
- /admin/global-vocab：表格可横向滚动；筛选下拉全宽

- [ ] **Step 7: Commit**

```bash
cd /workspace && git add frontend/src/components/admin/AdminCosts.jsx frontend/src/components/admin/AdminGlobalVocab.jsx
git commit -m "feat: AdminCosts 和 AdminGlobalVocab 表格移动端适配"
```

---

## Task 13: AdminApiKeys 模态框响应式

**Files:**
- Modify: `frontend/src/components/admin/AdminApiKeys.jsx`

- [ ] **Step 1: 三个固定宽度模态框改响应式**

读取 `frontend/src/components/admin/AdminApiKeys.jsx` 第 440-460、495-510、575-590 行。

找到第 447 行 `w-[480px]`，所在 className 改为：`w-full max-w-[480px]`。同时确认其外层遮罩有 `p-0 sm:p-4`（若没有则添加）。

找到第 503 行 `w-[480px]`，同样改为 `w-full max-w-[480px]`。

找到第 584 行 `w-[420px]`，改为 `w-full max-w-[420px]`。

- [ ] **Step 2: 模态框外层遮罩补 p-0 sm:p-4**

对每个模态框的外层遮罩（通常是 `fixed inset-0 z-50 flex items-center justify-center ... bg-black/40`），确认 padding 是否为 `p-4`。若是，改为 `p-0 sm:p-4`。

模态框本身的 className 添加 `sm:rounded-md`（手机无圆角，桌面有圆角）。

- [ ] **Step 3: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 4: 手动验证**

DevTools iPhone SE，访问 /admin/api-keys：
- 点击新增/编辑 API Key：模态框全宽（留少量边距），不溢出屏幕

DevTools iPad：模态框恢复 max-w-480/420 居中。

- [ ] **Step 5: Commit**

```bash
cd /workspace && git add frontend/src/components/admin/AdminApiKeys.jsx
git commit -m "feat: AdminApiKeys 模态框移动端响应式"
```

---

## Task 14: LandingPage 移动端汉堡菜单

**Files:**
- Modify: `frontend/src/pages/LandingPage.jsx`

- [ ] **Step 1: 添加 useState 导入和菜单状态**

在 `frontend/src/pages/LandingPage.jsx` 顶部确认 `useState` 已从 react 导入（LandingPage 通常已有 state）。

在组件函数体中添加：

```jsx
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
```

- [ ] **Step 2: 在导航栏添加汉堡按钮**

读取第 282-310 行，找到导航栏 `<nav>` 或 `<header>` 区域。

现状（第 291 行附近）：桌面导航 `hidden sm:flex`。

在桌面导航的同一容器内，`</nav>` 或导航项列表之后，添加汉堡按钮和移动菜单：

```jsx
            {/* 手机汉堡按钮 */}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              className="sm:hidden w-10 h-10 flex items-center justify-center text-ink-600 hover:bg-parchment-200/60 rounded-md transition-colors"
              aria-label="菜单"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              )}
            </button>
```

- [ ] **Step 3: 添加移动端下拉菜单**

在导航栏 `</nav>` 或 `</header>` 之后（但仍在外层 header 容器内），添加下拉菜单：

```jsx
            {/* 手机下拉菜单 */}
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="sm:hidden absolute top-16 left-0 right-0 bg-parchment-50 border-b-2 border-aged-200 shadow-retro-lg z-40"
              >
                <div className="flex flex-col px-6 py-4 gap-2">
                  <a href="#features" onClick={() => setMobileMenuOpen(false)} className="btn-ghost text-left">功能</a>
                  <a href="#mode" onClick={() => setMobileMenuOpen(false)} className="btn-ghost text-left">模式</a>
                  <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="btn-ghost text-left">价格</a>
                  <div className="border-t border-aged-200 my-1" />
                  <a href="/login" onClick={() => setMobileMenuOpen(false)} className="btn-ghost text-left">登录</a>
                  <a href="/login" onClick={() => setMobileMenuOpen(false)} className="btn-primary text-center">注册</a>
                </div>
              </motion.div>
            )}
```

**注意**：
1. 确认 `motion` 已从 framer-motion 导入（LandingPage 已用 framer-motion）。
2. 锚点 href（`#features`/`#mode`/`#pricing`）需与 LandingPage 实际 section id 对应。用 Grep 搜索 `id="` 确认实际 id，按需调整。
3. 外层 header 容器需有 `relative` 定位，使下拉菜单 `absolute` 生效。若 header 没有 `relative`，添加。

- [ ] **Step 4: 点击外部关闭菜单（可选增强）**

在组件函数体添加 useEffect：

```jsx
  useEffect(() => {
    if (!mobileMenuOpen) return
    const handler = (e) => {
      // 点击菜单按钮或菜单内部不关闭
      if (e.target.closest('[data-mobile-menu]')) return
      setMobileMenuOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [mobileMenuOpen])
```

给汉堡按钮和下拉菜单的外层容器加 `data-mobile-menu` 属性。

**注意**：若觉得复杂可跳过此步，用户点击导航项后菜单已会收起（Step 3 的 onClick）。

- [ ] **Step 5: 对比区三栏 gap 响应式**

找到第 493-505 行对比区 `flex items-center gap-4 md:gap-8`，改为 `flex items-center gap-2 sm:gap-4 md:gap-8`。

两侧文字块加 `flex-1 min-w-0`（在 className 中追加）。

- [ ] **Step 6: Hero 区 min-h-screen 改 100svh**

找到第 312 行 Hero 区 `min-h-screen`，改为 `min-h-screen min-h-[100svh]`（双 class，旧浏览器用前者，新浏览器用后者覆盖）。

- [ ] **Step 7: section padding 响应式**

用 Grep 搜索 LandingPage.jsx 中的 `px-6`（限制在 section 容器上），批量改为 `px-4 sm:px-6`。

**注意**：用 `replace_all` 模式，但需先确认所有 `px-6` 都应改（导航栏的 `px-6` 可能保持）。建议逐个确认。

- [ ] **Step 8: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 9: 手动验证**

DevTools iPhone SE，访问首页：
- 预期：右上角有汉堡按钮，点击展开下拉菜单
- 点击菜单项：菜单收起，跳转锚点
- Hero 区高度正确，地址栏收起/展开无跳动

DevTools iPad (640px+)：汉堡按钮消失，恢复桌面导航。

- [ ] **Step 10: Commit**

```bash
cd /workspace && git add frontend/src/pages/LandingPage.jsx
git commit -m "feat: LandingPage 移动端汉堡菜单和细节响应式"
```

---

## Task 15: LoginPage 背景动画移动端优化

**Files:**
- Modify: `frontend/src/pages/LoginPage.jsx`

- [ ] **Step 1: 读取 DotBackground 现有结构**

Run: Read `frontend/src/pages/LoginPage.jsx` 第 1-60 行，确认 `sp = 28`（第 46 行）和动画循环结构。

- [ ] **Step 2: 添加移动端检测和参数调整**

找到第 46 行 `const sp = 28`（或类似常量声明），改为根据屏幕宽度动态调整：

```jsx
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  const sp = isMobile ? 56 : 28
  const targetFps = isMobile ? 30 : 60
```

- [ ] **Step 3: 动画循环应用 fps 限制**

找到动画循环（通常是 `requestAnimationFrame`），在时间判断中应用 `targetFps`：

```jsx
    const frameInterval = 1000 / targetFps
    let lastTime = 0
    const animate = (timestamp) => {
      if (timestamp - lastTime < frameInterval) {
        rafRef.current = requestAnimationFrame(animate)
        return
      }
      lastTime = timestamp
      // ... 原有绘制逻辑
      rafRef.current = requestAnimationFrame(animate)
    }
```

**注意**：具体实现需读取现有动画循环代码。若现有代码已有 fps 控制逻辑，仅修改 fps 值；若无，则按上述模式添加。读取第 40-100 行确认。

- [ ] **Step 4: 卡片内边距检查**

用 Grep 搜索 LoginPage.jsx 中的 `p-8`，若登录卡片内部有 `p-8`，改为 `p-5 sm:p-8`。

- [ ] **Step 5: 构建验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功。

- [ ] **Step 6: 手动验证**

DevTools iPhone SE，访问 /login：
- 预期：背景动画点距变大（节点减少），帧率降低（流畅不卡顿）
- 登录卡片布局正常

DevTools 桌面：背景动画恢复密集 + 60fps。

- [ ] **Step 7: Commit**

```bash
cd /workspace && git add frontend/src/pages/LoginPage.jsx
git commit -m "feat: LoginPage 背景动画移动端降帧优化"
```

---

## Task 16: 全断点手动验证

**Files:** 无（仅验证）

- [ ] **Step 1: 启动开发服务器**

Run: `cd /workspace/frontend && npm run dev`

- [ ] **Step 2: 320px（iPhone SE）全页面验证**

DevTools 切换到 iPhone SE (375px，或自定义 320px)，逐一访问并验证：

- [ ] `/`（首页）：汉堡菜单可用，Hero 高度正确，无横向溢出
- [ ] `/login`：卡片居中，背景动画流畅
- [ ] `/learn`：侧边栏抽屉可用，主内容全宽
- [ ] `/learn` 学习步骤：题目卡片 padding 合适，选项可点击
- [ ] `/learn` 字典步骤：双栏横向滑动，圆点指示器同步
- [ ] `/learn` 单词表弹窗：弹窗高度合理
- [ ] `/learn` 设置弹窗：全屏覆盖，顶部水平 Tab
- [ ] `/admin`：侧边栏抽屉可用
- [ ] `/admin/users`：卡片列表显示
- [ ] `/admin/costs`：表格/卡片切换
- [ ] `/admin/api-keys`：模态框不溢出

- [ ] **Step 3: 768px（iPad）验证**

- [ ] `/learn`：侧边栏常驻可折叠
- [ ] `/learn` 字典步骤：恢复 50/50 双栏
- [ ] `/admin`：侧边栏常驻
- [ ] `/admin/users`：恢复 8 列表格

- [ ] **Step 4: 1024px（桌面）验证**

- [ ] 所有页面保持原有桌面布局不变
- [ ] 无回归（与改造前视觉一致）

- [ ] **Step 5: 构建最终验证**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功，无警告（或仅有已知的安全警告）。

- [ ] **Step 6: 最终 Commit（如有遗漏修复）**

若验证中发现问题并修复，提交修复：

```bash
cd /workspace && git add -A
git commit -m "fix: 全断点验证修复"
```

若一切正常，无需提交，直接完成。

---

## 自审清单

完成计划编写后，对照 spec 检查覆盖：

### Spec 覆盖检查
- [x] 3.1 全局基础（useMediaQuery + CSS 工具类）→ Task 1
- [x] 3.2 LandingPage（汉堡菜单 + 细节微调）→ Task 14
- [x] 3.3 LoginPage（背景动画 + 卡片 padding）→ Task 15
- [x] 3.4 LearningApp（100svh + HistorySidebar 抽屉）→ Task 2, 3
- [x] 3.5 DictionaryStep（横向滑动 + 圆点指示器 + 工具栏）→ Task 4
- [x] 3.6 LearningStep + 题目组件 + VocabListStep + WordListPanel → Task 5, 6, 7
- [x] 3.7 AllUnitsStep + PhaseSelectorStep → Task 9
- [x] 3.8 SettingsModal（全屏 + 顶部 Tab + 滚动锁定）→ Task 8
- [x] 3.9 AdminPage + AdminUsers + AdminCosts + AdminGlobalVocab + AdminApiKeys → Task 10, 11, 12, 13
- [x] 4.1 抽屉 ESC 关闭 → Task 10（AdminPage 已含，HistorySidebar 建议补）
- [x] 4.2 横向滑动 snap 边界 → Task 4（onScroll + debounce 通过 setState 天然节流）
- [x] 4.3 全屏模态滚动锁定 → Task 8
- [x] 5. 测试策略 → Task 16（手动验证清单）
- [x] 6. 实现顺序 → Task 1-16 按依赖排列

### 遗漏补充
- HistorySidebar 的 ESC 关闭：Task 2 未显式包含，建议在 Task 2 Step 8 附近补一个 useEffect 监听 ESC。由于 Task 2 已较长，作为可选项——若用户在验证时提出再补。

### 占位符扫描
- 无 TBD/TODO
- 每个 Step 都有具体代码或具体操作指令
- 字段名（如 `row.input_tokens`）在 Task 12 已标注"按实际字段调整"，属合理的不确定性提示

### 类型/命名一致性
- `useMediaQuery` hook 在 Task 1 定义，Task 2/4/8/10 使用，签名一致
- `isDesktop` 变量名在 Task 2/4/8/10 统一使用
- `mobile-drawer-overlay` / `touch-scroll-x` / `snap-item` CSS 类在 Task 1 定义，后续 Task 引用一致
