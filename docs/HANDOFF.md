# Handoff — 交给 Codex / 同类 agent

**项目路径（请在此目录打开）：** `/workspace/wangzhi-train`

先读：`AGENTS.md` → `docs/SPEC.md` → `docs/TASKS.md` → 本文件 → `docs/PRODUCT.md`。参考只读：`docs/reference/`。

T17 / T18 / T19（全局锁住卡、四指标速记、21 章武器库）见 SPEC 与 TASKS；实现后优先保证反打六局面（R3 锁）不被改盘。

## 建议首批任务（择一或按序）

### A. PDF 文本层导入（P0）

- 家长在资料库上传/选择 PDF，抽取 **text layer** 中的着法与备注。
- 写入或更新 `games[]`（PDN / moves / notes）；失败时温和提示，勿假装扫描识别成功。
- **不做** 扫描识别、云上传、账号。

**验收：** 对带可选中文字层的 PDF，能得到可浏览着法或可粘贴的 PDN 草稿；项目构建通过。

### B. PDN 补全种子局面（P0）

- 种子 6 道题与「天津青少赛汇总」壳仍是 `START_FEN` 占位（`placeholder: true`）。
- 支持粘贴完整/分段 PDN，定位到 `moveIndex`，把题目 `fen` 更新为该节点局面，并清除占位标记。
- 非法着法跳过并提示（现有尽力引擎可沿用）。

**验收：** 至少一局有真实 PDN 后，对应草稿题棋盘不再是开局；旧 localStorage 数据不崩。

### C. 答线标记与复盘图（P1）

- 题库：点格标记答线更清晰（保存进 `completions`）。
- 复盘本：四指标历史的简易图表（纯 CSS/canvas/SVG 均可，勿上图表大库除非必要）。

**验收：** 孩子完成自检后能回看标记；复盘列表能看出趋势；构建通过。

## 不要做（除非用户明确要求）

- 题海模式、排行榜、同伴比较、焦虑催促文案
- React/Vue/Next 等重框架迁移
- 完整合法着法裁判引擎重写、Lidraughts OAuth、云同步、账号系统
- 扫描识别（属 P2）、清空或破坏性改写 wangzhi-train-v1 而不做迁移
- 提交依赖目录、构建产物、密钥文件

## 本地命令

安装依赖后启动开发服务器；改完后执行 Vite 生产构建并确认通过。

## 提交习惯

小步提交；中文或英文 concise message；改 storage schema 时在说明里写清迁移方式。
