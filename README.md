# 上下文瘦身（cortico-world-slim）

给大肥鱼用的上下文瘦身 World。解决的问题很具体：每次上下文交接都会在
`workspace/handoffs/` 里落一份笔记，越堆越厚；下一轮想接上前几天的事，按默认
做法是翻原文，一翻就是几万 token。

这个 World 把旧笔记折成一份 `handoffs/DIGEST.md`（时间、体量、聊过的小节、动过的
工具、开头一段），原文搬到工作区外的归档目录，工作区里只留最近几份。她读摘要就
能接上事，细节再按日期去归档里翻。

## 它改什么、不改什么

改：

- `workspace/handoffs/` 里超出 `keepHandoffs` 份的旧笔记 → 移到
  `data/slim-archive/handoffs/`（**不删**，随时能翻回去）；
- `workspace/handoffs/DIGEST.md` → 每次瘦身后重写；
- `data/slim-archive/handoffs/index.json` → 归档笔记的摘要元数据，重建摘要只读它，
  不用把几十 KB 原文重新读一遍。

不改：

- `CONSTITUTION.md`、`PARTNER.md`、`partner/`、`log/`、`qqbot-known-messages.json`
  等她自己写的东西；
- 正在进行的会话上下文。**注意**：每次请求的上下文由 Persona 装配，World 没有钩子
  去改它；这个包瘦的是"记忆文件"，不是"当前对话窗口"。后者要用 `/compact` 或摘要。

## 三个工具

| 工具 | 作用 |
| --- | --- |
| `slim_report` | 只读：工作区多厚、笔记堆了多少、归档能省多少 |
| `slim_compact` | 归档超出的旧笔记 + 重写摘要；不传 `apply: true` 只给计划 |
| `slim_digest` | 只重写摘要，不搬文件 |

环境提示词（`src/ENV_PROMPT.md`）会告诉模型：接事之前先读摘要，别一上来逐份翻原文；
摘要不够细再用 `slim_compact`。

## 配置（`worlds.slim`）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | World 挂不挂载 |
| `autoCompact` | `true` | 每轮结束后自动瘦身 |
| `keepHandoffs` | `3` | 工作区里留几份最近原文 |
| `minIntervalMinutes` | `30` | 两次自动瘦身的最小间隔 |
| `digestTokens` | `120` | 摘要里每条旧笔记最多占多少 token |

前四个都是 `x-hot`，改完即时生效。

## 安装方式

### 扩展市场

扩展市场按 npm 关键字 `cortico-world` 发现包，所以本包发布到 npm 后，在 Coopanion
的「扩展市场」搜 `slim` 或 `上下文瘦身` 即可直接安装：

```bash
pnpm add cortico-world-slim   # 在 data/extensions/ 里跑，或直接用市场界面
```

### 源码

```bash
git clone https://github.com/LFY-sys/cortico-world-slim.git
cd 你的Coopanion/data/extensions
pnpm add link:../cortico-world-slim
```

装完后在 `data/home/companion/config.json` 里确认 `worlds.slim.enabled: true`，重启
Coopanion 生效（`/api/worlds` 里 `slim` 状态应为 `active`，工具三个）。

## 回退

- 只停用：把 `worlds.slim.enabled` 改成 `false`，重启；工作区文件原样留着。
- 完全移除：`data/extensions/package.json` 删掉那一行，`pnpm install`，删
  `data/extensions/local/cortico-world-slim`；归档目录里的原文可以搬回 `handoffs/`。

## 版本

0.1.0 —— 首次可用版本。上游 cortico 的 World api 为 6；`src/` 直接由 Node 的类型
剥离加载（与 qq-final、fatfish 同一种写法），没有构建步骤。

## English

A small World for Coopanion that keeps the pet's workspace from bloating. Every
context handoff drops a note in `workspace/handoffs/`; older notes get folded into
`handoffs/DIGEST.md` (time, size, section titles, tools used, opening line) and moved
out of the workspace into `data/slim-archive/handoffs/` — nothing is deleted. The world
also rewrites the digest before boot and after each turn, so catching up costs a short
read instead of tens of thousands of tokens.

Tools: `slim_report` (read-only audit), `slim_compact` (archive + rewrite digest),
`slim_digest` (rewrite digest only). Config lives under `worlds.slim`
(`enabled`, `autoCompact`, `keepHandoffs`, `minIntervalMinutes`, `digestTokens`).

Scope: this slims **memory files**, not the live conversation window — that one is
assembled by the Persona and can only be shortened with `/compact`.

Install: publish target is npm (`keywords: ["cortico-world", ...]`), so it shows up in
Coopanion's extension market; or clone the repo and `pnpm add link:../cortico-world-slim`.
