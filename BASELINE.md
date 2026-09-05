# 基线记录（T0）

记录日期：2026-09-05

## 运行形态

- Vite 5 + 原生 ESM，入口为 `index.html` / `src/main.js`。
- 数据当前来自浏览器 `localStorage`；仓库历史代码使用 `wangzhi-train-v1`。
- 本项目没有后端、账号或云同步；棋盘为 10×10、深色格 1–50。

## 已有模块

| 模块 | 当前入口 | 基线状态 |
| --- | --- | --- |
| 今天 | `src/pages/today.js` | 每日最多 1 道已发布题，自检与标记已存在 |
| 题库 | `src/pages/problems.js` | 草稿/发布/归档、今日题、标记线路已存在 |
| 资料库 | `src/pages/library.js` | 建局、PDN 粘贴、逐手浏览、标签、生成草稿已存在；PDF 文本层导入已接入 |
| 复盘本 | `src/pages/review.js` | 四项指标录入与历史列表已存在 |
| 锁住清单 | `src/pages/locklist.js` | 查反击/做简化/停设饵已存在 |
| 周计划 | `src/pages/weekplan.js` | 可编辑周计划已存在 |

## 关键函数

- 棋盘几何：`sqToRC` / `rcToSq`（当前命名与 SPEC 的 `rowCol` / `numOf` 不同）。
- 局面：`parseFen` / `boardToFen` / `applyMove` / `applyMoveList`。
- PDN：`parsePdnOrMoves` / `movesToPdnBody`。
- 资料库回放：`boardAtMove`。

## 已知缺口（按 TASKS 排序）

1. 尚无 `npm test` 与纯函数单测；局面演算器仍为 best-effort，未覆盖强制吃子、最长吃子、王棋长跳等 SPEC 规则。
2. 尚无反打扫描器、自定义关卡池、速刷/错题本/盲算、开局武器库等 SPEC 扩展模块。
3. 尚无 `schemaVersion`、SPEC 规范键 `wz-counter-trainer-v1`、完整迁移与 JSON 导入/导出闭环。
4. 当前导航与 SPEC 六大模块信息架构不同；保守升级阶段暂不重写已运行页面。

## 本阶段验证

- `npm run build`：通过（Vite 5.4.21）。
- 浏览器开发服务器在受限环境中无法监听 `127.0.0.1:5173`（`EPERM`），需在本机浏览器手工回归。
