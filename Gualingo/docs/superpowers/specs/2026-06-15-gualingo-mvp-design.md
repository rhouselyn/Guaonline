# 呱邻国商业化 MVP 设计文档

**日期:** 2026-06-15
**状态:** 已确认

---

## 目标

将呱邻国从开源工具改造为 Freemium SaaS 产品 MVP：着陆页 + 登录注册 + 学习应用。

## 风格

Retro Vintage，与现有学习界面统一（暖色纸张质感、serif 标题、aged 边框）。

## 架构

- **前端**: 独立 React (Vite) 项目，部署到 Cloudflare Pages
- **后端**: 现有 FastAPI，通过 Cloudflare Tunnel 暴露
- **认证**: JWT（邮箱+密码注册登录）
- **算法艺术**: 着陆页 Hero 区动态背景（p5.js）

## 着陆页板块

1. **Hero 区** - 产品名 + Slogan + CTA（开始学习/登录）+ 算法艺术动态背景
2. **功能展示** - 6大核心功能：任意语言互学、三种输入模式、AI生成练习、收藏单词、语音朗读、分阶段学习
3. **使用流程** - 输入文本 → AI分句翻译 → 学单词 → 练句子
4. **定价区** - 免费/基础/专业三档
5. **Footer** - GitHub 开源链接 (https://github.com/rhouselyn/Gualingo)

## 文件结构变更

### 新增
```
frontend/src/
  pages/
    LandingPage.jsx      ← 着陆页
    LoginPage.jsx        ← 登录注册
    LearningApp.jsx      ← 现有 App.jsx 重命名
  utils/
    auth.js              ← 认证工具（token 管理、axios 拦截器）
  components/
    AccountMenu.jsx      ← 用户菜单
backend/
  auth/
    __init__.py
    models.py            ← 用户数据模型
    jwt_utils.py         ← JWT 生成/验证
    deps.py              ← 依赖注入
    router.py            ← 认证路由
```

### 修改
```
frontend/src/App.jsx     ← 改为路由入口（着陆页/登录/学习）
frontend/src/main.jsx    ← 添加 react-router
frontend/src/utils/api.js ← 添加认证 header
backend/main.py          ← 注册认证路由
backend/requirements.txt ← 添加 pyjwt, passlib, python-jose
```

## 认证流程

1. 用户访问着陆页 → 点击"开始学习" → 跳转登录页
2. 登录页支持：邮箱注册、邮箱登录、跳过登录（BYOK 模式）
3. JWT: access_token 15min + refresh_token 7天
4. 前端 axios 拦截器自动附加 token，401 时自动刷新

## 部署

- 前端: `npm run build` → Cloudflare Pages
- 后端: `cloudflared tunnel` 暴露本地 FastAPI
- CORS: 后端配置允许前端域名
