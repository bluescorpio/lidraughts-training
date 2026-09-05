# AGENTS.md — 王植训练站（coding-agent 契约）

面向 OpenAI Codex / Cursor / 同类 coding agent。改代码前先读本文件与 `docs/SPEC.md`、`docs/TASKS.md`、`docs/HANDOFF.md`、`docs/PRODUCT.md`。

## 技术栈与数据

- **Vite 5 + 原生 ESM（vanilla JS）**，无 React/Vue 等重框架。
- 持久化：浏览器 `localStorage`，键名 **`wz-counter-trainer-v1`**（见 `src/store.js`）；读取并迁移旧键 `wangzhi-train-v1`。`schemaVersion` 当前为 **2**（含 `metricLogs` / `weaponProgress` / `weaponStars`）。
- UI 语言：**简体中文**。
- 角色：页眉切换 **孩子 / 家长**（`role: 'child' | 'parent'`）。
- **今天**硬限制：每天最多 **1** 道已发布题目（`publishDate` 当日或 `publishedTodayId`）。

## 红线（产品不可破）

- **不题海**：不加「再来 10 题」「刷题排行」等加量入口。
- **不比较**：不出现名次、胜率对比、与同龄人对比的文案。
- **不焦虑**：不用「落后了」「再不练就…」等施压话术；提示温和、可执行。
- 开局体系现阶段不扩谱；保持 32-28 / 18-23 即可。

## 目录地图

```
src/main.js          # 路由/壳、角色切换、挂载各页
src/store.js         # load/save、KEY、todayStr、uid
src/seed.js          # 首次种子：天津青少赛壳 + 6 道反打草稿 + 周计划
src/style.css
src/draughts/
  board.js           # 10x10、黑格 1–50、START_FEN、着法应用（尽力）
  BoardView.js       # 棋盘渲染与点格标记
  pdn.js             # PDN 解析（尽力而为）
src/pages/
  today.js           # 今天：1 题 / 自检 / 无任务文案
  problems.js        # 题库：草稿/发布/归档、线路标记
  library.js         # 资料库：建局、PDN、五类标记→出题草稿
  review.js          # 复盘速记：metricLogs 四指标
  locklist.js        # 锁住清单正式三步
  weapons.js         # 21 章打击武器库 + 红星复习
  weekplan.js        # 周计划
src/lockFloat.js     # 全局浮动锁住卡片（session 勾选，不计入 leadLock）
src/metrics.js
src/weapons.js
docs/
  SPEC.md            # 权威规格（T17–T19 补丁）
  TASKS.md
  PRODUCT.md
  HANDOFF.md
  reference/         # 训练方案与九轮复盘摘录（只读参考）
```

## 已完成 vs 下一步优先级

### 已完成（MVP）

- 今天 / 题库 / 资料库 / 复盘速记 / 锁住清单 / 武器库 / 周计划
- 全局浮动「🛡️ 锁住清单」；四指标 `metricLogs`；21 章打卡与红星
- 孩子·家长角色；localStorage；种子反打预警草稿（占位局面）
- 10×10 格棋盘 + 尽力 PDN / 着法

### 下一步（按优先级）

| 优先级 | 任务 | 说明 |
| --- | --- | --- |
| **P0** | PDN 补局面 | 种子题 placeholder + START_FEN 换成真实关键节点 |
| **P1** | 计时题红星提示 | 站内尚无计时题；>10s 自动建议标星暂不做 |
| **P2** | OCR / Lidraughts / 云 / 全引擎 | 延后；勿擅自引入账号、云同步、完整裁判引擎 |

## 出题模板（按标记 tag）

见 problemTemplatesForTag in src/seed.js：

- 被反打 → 反打预警·正向 / 反打预警·逆向
- 该锁住 → 锁住检查（查反击 / 做简化 / 停设饵）
- 深推无援 → 深推检查

生成题目文案保持温和，强调「先看对方机会」。

## 工程约束

1. 迁移 storage 要小心：改 `wz-counter-trainer-v1` 结构时做向后兼容合并并升 `schemaVersion`，勿静默清空用户数据。
2. 改完后必须跑通项目构建（Vite build）。
3. 不要擅自上重框架（React/Vue/Next 等），除非用户明确要求。
4. 依赖尽量只加必要的；文本层 PDF 可用轻量库；扫描识别与云端属延后项。
5. 参考材料只读：docs/reference/wangzhi-training-plan.md、docs/reference/nine-round-review-extract.txt。
6. 提交信息简洁；勿提交依赖目录、构建产物、本地环境文件。

## 快速自检清单

- [ ] 中文 UI，无题海/比较/焦虑文案
- [ ] 今天仍硬限 1 题
- [ ] localStorage 键仍为 wangzhi-train-v1 或已做迁移
- [ ] 项目构建命令成功通过
