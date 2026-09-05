# 王植训练站（Zack / Wang Zhi）

国际跳棋（100 格）家庭训练 MVP：孩子看「今天」一道题，家长用资料库 / 出题 / 题库 / 复盘。

> **给 Codex / coding agent：** 请先读 [`AGENTS.md`](./AGENTS.md) 与 [`docs/HANDOFF.md`](./docs/HANDOFF.md)。产品红线见 [`docs/PRODUCT.md`](./docs/PRODUCT.md)。

## 快速开始

在项目目录：安装依赖 → 启动开发服务器 → 浏览器打开终端提示地址（默认 http://localhost:5173/）。

静态构建：跑 Vite 生产构建；可选 preview 预览 dist/。产物可用任意静态服务器托管（base 为相对路径）。

## MVP 已包含

- **今天**：每天最多 1 道已发布题；完成自检；无任务时显示「今天没有任务」
- **题库**：草稿 / 已发布 / 归档；点格标记线路 + 我对了 / 有点漏了
- **资料库**：建局、PDN/PGN 导入（自动提取并入库，可删除）、PDF 文本层导入、着法浏览、五类标记、从标记生成出题草稿
- **复盘本**：四项指标 + 历史列表
- **锁住清单**：查反击 / 做简化 / 停设饵
- **周计划**：默认可编辑清单，存 localStorage
- **棋盘**：10×10，黑格 1–50，标准开局；着法尽力应用

## 角色

页眉切换「孩子 / 家长」：

- 孩子：今天、题库、锁住清单、复盘本、周计划（资料库入口隐藏）
- 家长：另含资料库；负责发布题目并设为今日

数据在浏览器 localStorage（规范键名 `wz-counter-trainer-v1`；会读取并迁移旧版 `wangzhi-train-v1`），无账号、无云同步。

## 种子数据

首次打开会预载：棋谱壳「天津青少赛汇总」；6 道草稿「反打预警·正向」题（R1/R3/R6/R7/R8/R9）。家长发布后孩子「今天」才可见（每天硬限制 1 道）。

## 刻意未做（见 docs/HANDOFF.md）

- 扫描识别（P2）
- 种子题真实 PDN 局面（P0）
- Lidraughts、完整引擎、账号、云同步、题海与比较文案

## 技术

Vite 5 + 原生 ES Module。目录：src/main.js、store.js、seed.js、draughts/、pages/。契约与优先级见 AGENTS.md。

## 开发自测

```bash
npm test       # 纯函数规则、PDN、扫描、迁移测试
npm run build  # Vite 生产构建
```
