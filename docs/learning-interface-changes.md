# 学习界面 Bug 修复与 Prompt 修改记录

## 一、Bug 修复

### 1. 翻译方向错误
- **文件**: `backend/routers/text_processing.py`
- **问题**: 翻译模式下，翻译方向为 source→target（学习语言→母语），应该是 target→source（母语→学习语言），即把母语翻译为正在学习的语言
- **修复**: 将翻译方向从 source→target 改为 target→source

### 2. Auto 模式语言闪现 "en"
- **文件**: `frontend/src/components/DictionaryStep.jsx`、`frontend/src/pages/LearningApp.jsx`
- **问题**: Auto 模式下，语言检测完成前 DictionaryStep 会短暂显示默认值 "en"，导致用户看到错误的语言标识闪现
- **修复**:
  - LearningApp 新增 `detectedLang` 状态，轮询检测到语言后更新该状态并传递给 DictionaryStep
  - DictionaryStep 新增 `detectedLang` prop，auto 模式下通过轮询结果更新语言，而非从 API 获取
  - 语言图标在未检测到语言时不显示，避免显示错误语言

### 3. 语言检测后状态未同步
- **文件**: `Gualingo/backend/routers/text_processing.py`
- **问题**: 语言检测完成后，processing_status 中的 source_lang 未更新，导致后续流程可能使用错误的语言信息
- **修复**: 语言检测完成后同步更新 processing_status 中的 source_lang

### 4. 历史记录写入时机过晚
- **文件**: `Gualingo/backend/routers/text_processing.py`
- **问题**: 历史记录在文本处理完成后才写入，用户在处理期间看不到新条目
- **修复**: 将历史记录写入时机从文本处理完成后提前到处理前立即写入；非 auto 模式在后台任务启动前立即保存语言设置和历史记录

### 5. 非 Auto 模式切换时语言重置
- **文件**: `Gualingo/frontend/src/components/InputStep.jsx`
- **问题**: 从直接输入（非 auto）切到翻译/生成模式时，会切换到记住的语言而非保持当前选的语言
- **修复**: 切换模式时保持当前选的语言，不再切换到记住的语言

### 6. nonDirectModeLangRef 默认值导致语言闪现
- **文件**: `Gualingo/frontend/src/components/InputStep.jsx`
- **问题**: nonDirectModeLangRef 默认值为 'en'，在 recentLanguages 加载完成前会使用错误默认值
- **修复**: 默认值从 'en' 改为 null，等 recentLanguages 加载后再初始化

### 7. 提交文本后历史记录未及时刷新
- **文件**: `Gualingo/frontend/src/pages/LearningApp.jsx`
- **问题**: 提交文本后历史记录列表不会立即刷新，用户需手动刷新才能看到新条目
- **修复**: 处理开始后立即刷新历史记录列表；提交文本时重置 detectedLang

---

## 二、Prompt 修改

### 分词规则：固定搭配合并条件收紧
- **文件**: `Gualingo/backend/utils/exercise_generators.py`
- **问题**: 原规则"当整体含义不等于各组成部分字面含义的简单叠加时，必须将整个多词表达作为一个 token"过于宽泛，LLM 会过度解读，将介词+动词、冠词+名词等语法上经常搭配但语义各自独立的组合强行合并
- **修改前**:
  ```
  4. 【极其重要·固定搭配与多词表达】当整体含义不等于各组成部分字面含义的简单叠加时，必须将整个多词表达作为一个 token
  ```
- **修改后**:
  ```
  4. 【极其重要·固定搭配与多词表达】只有当满足以下全部条件时，才将多个词合并为一个 token：
     - 整体含义无法从各组成部分的字面含义推导出来（即语义不可组合）
     - 在词典中作为独立词条存在（如习语、固定搭配）
     - 替换其中任何一个词都会导致整体含义改变或表达不自然
     默认情况下，每个词应该是独立的 token。只有确信是固定搭配/习语时才合并。不要将语法上经常搭配但语义各自独立的词组合并（如介词短语、冠词+名词、助动词+动词等，这些组合中每个词的含义都是独立的、可从字面理解的）。
  ```
- **改动要点**:
  - 从"满足一个条件即合并"改为"三个条件全部满足才合并"，大幅收紧合并门槛
  - 增加"默认独立"原则，明确只有固定搭配/习语才合并
  - 明确排除语法上经常搭配但语义各自独立的组合
