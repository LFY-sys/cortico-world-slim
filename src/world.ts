/**
 * 上下文瘦身 World：工作区里的交接笔记越堆越厚，这里把它们折成一份摘要，原文搬去归档。
 *
 * 为什么不做"每轮截断上下文"：一次请求的上下文由 Persona 拥有，World 只能通过
 * envPromptVars / tools / 事件影响它，没有改写的钩子。真正每天在涨、又会被反复读的，
 * 是工作区里那堆 `handoffs/*.md` 和系统前缀里的文件清单；把它们收成一份摘要，
 * 是这个世界能给的、实打实的省。
 *
 * 安全边界：只动 `handoffs/` 下自己的文件名；CONSTITUTION.md、PARTNER.md、partner/、log/
 * 一概只读不写。归档是"搬"，不是"删"——原文字节都在 `data/slim-archive/handoffs/`。
 */
import type { Language } from 'cortico/core/language.ts';
import type { ToolDef, World, WorldHost, WorldWebUiDecl } from 'cortico/core/types.ts';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLIM_ID, clampInt, intervalMs, slimConfigGroups, type SlimConfigSection } from './config.ts';
import { buildDigest, metaOf, savingLine, type NoteMeta } from './digest.ts';
import { estimateTokens, groupStats, handoffNotes, humanTokens, readText, walkWorkspace, type FileStat, type NoteStat } from './scan.ts';
import { slimText } from './text.ts';

/** 环境提示词模板；`{{...}}` 的洞由 envPromptVars() 填。 */
const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

/** 摘要文件名；扫 `handoffs/` 时排掉它自己。 */
const DIGEST_NAME = 'DIGEST.md';

export interface SlimWorldOptions {
  /** `worlds.slim` 活配置。 */
  cfg: SlimConfigSection;
  /** 部署目录（`data/home/<bot>`），工作区在它下面的 `workspace/`。 */
  botDir: string;
  /** 部署的数据目录，归档与日志放这里——工作区外面。 */
  dataDir: string;
  language?(): Language;
}

export class SlimWorld implements World {
  readonly id = SLIM_ID;
  private readonly opts: SlimWorldOptions;
  private host: WorldHost | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastAuto = 0;
  private busy = false;

  constructor(opts: SlimWorldOptions) {
    this.opts = opts;
  }

  // ---- 路径 ----

  private get workspace(): string {
    return join(this.opts.botDir, 'workspace');
  }

  private get handoffsDir(): string {
    return join(this.workspace, 'handoffs');
  }

  private get digestPath(): string {
    return join(this.handoffsDir, DIGEST_NAME);
  }

  /** 归档放在工作区外：不进文件清单，也不会被当成记忆读进去。 */
  private get archiveDir(): string {
    return join(this.opts.dataDir, 'slim-archive', 'handoffs');
  }

  private get indexPath(): string {
    return join(this.archiveDir, 'index.json');
  }

  private get logPath(): string {
    return join(this.opts.dataDir, 'slim-activity.log');
  }

  // ---- 读盘 ----

  private cfg(): SlimConfigSection {
    return this.opts.cfg;
  }

  private keep(): number {
    return clampInt(this.cfg().keepHandoffs, 3, 1, 50);
  }

  private digestTokens(): number {
    return clampInt(this.cfg().digestTokens, 120, 40, 600);
  }

  /** 盘点：哪些笔记还在、摘要多大。 */
  private snapshot(): { files: FileStat[]; notes: NoteStat[] } {
    const files = existsSync(this.workspace) ? walkWorkspace(this.workspace) : [];
    const notes = handoffNotes(this.workspace, files).filter((n) => !n.rel.endsWith(`/${DIGEST_NAME}`));
    return { files, notes };
  }

  private readIndex(): Record<string, NoteMeta> {
    try {
      const raw = readFileSync(this.indexPath, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, NoteMeta>;
    } catch {
      /* 没有索引就从零开始 */
    }
    return {};
  }

  private writeIndex(index: Record<string, NoteMeta>): void {
    if (!existsSync(this.archiveDir)) mkdirSync(this.archiveDir, { recursive: true });
    writeFileSync(this.indexPath, `${JSON.stringify(index, null, 1)}\n`, 'utf8');
  }

  /** 归档里的素材，按时间排好。 */
  private archivedMetas(): NoteMeta[] {
    return Object.values(this.readIndex()).sort((a, b) => a.stamp.localeCompare(b.stamp));
  }

  /** 重写 DIGEST.md；返回这次写进去的大小。 */
  private rebuildDigest(metas: NoteMeta[], liveCount: number): number {
    if (!existsSync(this.handoffsDir)) mkdirSync(this.handoffsDir, { recursive: true });
    const text = buildDigest(metas, {
      digestTokens: this.digestTokens(),
      now: new Date(),
      archiveDir: this.archiveDir,
      liveCount,
    });
    writeFileSync(this.digestPath, text, 'utf8');
    return estimateTokens(text);
  }

  private log(line: string): void {
    try {
      mkdirSync(dirname(this.logPath), { recursive: true });
      appendFileSync(this.logPath, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch {
      /* 日志写不了不影响主流程 */
    }
  }

  // ---- 体检 ----

  /** 报告：现在多少东西、能省多少、下一步做什么。 */
  report(): string {
    const { files, notes } = this.snapshot();
    if (!existsSync(this.workspace)) return `工作区还不存在：${this.workspace}`;
    const groups = groupStats(files);
    const total = files.reduce((sum, f) => sum + f.tokens, 0);
    const noteTokens = notes.reduce((sum, n) => sum + n.tokens, 0);
    const digestBytes = existsSync(this.digestPath) ? statSync(this.digestPath).size : 0;
    const digestTokens = digestBytes ? estimateTokens(readText(this.digestPath)) : 0;
    const keep = this.keep();
    const surplus = notes.slice(0, Math.max(0, notes.length - keep));
    const surplusTokens = surplus.reduce((sum, n) => sum + n.tokens, 0);
    const archived = this.archivedMetas();
    const archiveTokens = archived.reduce((sum, m) => sum + m.tokens, 0);

    const lines = [
      '## 工作区体检',
      `工作区：${this.workspace}`,
      `总计 ${files.length} 个文本文件，约 ${humanTokens(total)}。`,
      '',
      '| 位置 | 文件 | 估算 |',
      '| --- | --- | --- |',
      ...groups.map((g) => `| ${g.group} | ${g.files} | ${humanTokens(g.tokens)} |`),
      '',
      `### 交接笔记 handoffs/`,
      notes.length
        ? `共 ${notes.length} 份原文，约 ${humanTokens(noteTokens)}；最近一份 ${notes[notes.length - 1]?.stamp}。`
        : '还没有交接笔记。',
      notes.length ? `留 ${keep} 份的话，有 ${surplus.length} 份可以归档，约占 ${humanTokens(surplusTokens)}。` : '',
      notes.length
        ? `摘要 ${DIGEST_NAME}：${digestBytes ? humanTokens(digestTokens) : '还没生成'}；已归档 ${archived.length} 份（原文约 ${humanTokens(archiveTokens)}）。`
        : '',
      notes.length ? `归档后 handoffs/ 大约只剩 ${humanTokens(digestTokens + notes.slice(Math.max(0, notes.length - keep)).reduce((s, n) => s + n.tokens, 0))}：${savingLine(noteTokens + digestTokens, digestTokens + notes.slice(Math.max(0, notes.length - keep)).reduce((s, n) => s + n.tokens, 0))}。` : '',
      '',
      `### 节奏`,
      `自动整理：${this.cfg().autoCompact === false ? '关着' : `开着，最短间隔 ${clampInt(this.cfg().minIntervalMinutes, 30, 1, 1440)} 分钟`}；上次 ${this.lastAuto ? new Date(this.lastAuto).toISOString().replace('T', ' ').slice(0, 16) : '还没跑过'}。`,
      `归档位置：${this.archiveDir}`,
      '',
      surplus.length ? '要动手就调用 slim_compact 并传 apply: true；只想看一眼就不传。' : '没有要归档的，保持现状就好。',
    ];
    return lines.filter((l) => l !== '').join('\n');
  }

  /** 整理：dry-run 给计划，apply 才搬文件。 */
  compact(apply: boolean): string {
    const { notes } = this.snapshot();
    const keep = this.keep();
    const surplus = notes.slice(0, Math.max(0, notes.length - keep));
    if (!surplus.length) {
      const digest = this.archivedMetas();
      return `handoffs/ 里 ${notes.length} 份，没超过留的 ${keep} 份，不用归档。${digest.length ? `摘要里有 ${digest.length} 份归档笔记。` : ''}`;
    }
    const before = surplus.reduce((sum, n) => sum + n.tokens, 0);
    const plan = [
      `计划归档 ${surplus.length} 份：${surplus.map((n) => n.stamp).join('、')}`,
      `搬去 ${this.archiveDir}（原文不删），然后把摘要重写成约 ${humanTokens(this.digestTokens() * surplus.length)} 以内。`,
      `这一步省下约 ${humanTokens(before)} 的原文阅读量。`,
    ];
    if (!apply) return `${plan.join('\n')}\n\n这是预演，没有动文件。要真做，传 apply: true。`;

    if (!existsSync(this.archiveDir)) mkdirSync(this.archiveDir, { recursive: true });
    const index = this.readIndex();
    const moved: NoteMeta[] = [];
    for (const note of surplus) {
      const from = join(this.workspace, ...note.rel.split('/'));
      const to = join(this.archiveDir, `${note.stamp}.md`);
      const text = readText(from);
      if (!text) continue;
      try {
        renameSync(from, to);
      } catch {
        continue;
      }
      const meta = metaOf(text, note.stamp, note.bytes);
      index[note.stamp] = meta;
      moved.push(meta);
    }
    this.writeIndex(index);
    const digestCount = Object.keys(index).length;
    const liveCount = Math.max(0, notes.length - moved.length);
    const digestTokens = this.rebuildDigest(this.archivedMetas(), liveCount);
    this.lastAuto = Date.now();
    this.log(`archived=${moved.length} live=${liveCount} digest≈${digestTokens}t`);
    return [
      `归档了 ${moved.length} 份：${moved.map((m) => m.stamp).join('、')}`,
      `原文在 ${this.archiveDir}；索引 ${this.indexPath}。`,
      `摘要 ${DIGEST_NAME} 重建完成：${digestCount} 条，约 ${humanTokens(digestTokens)}。`,
      `handoffs/ 现在只剩 ${liveCount} 份原文。`,
    ].join('\n');
  }

  /** 只重写摘要，不搬文件。 */
  digestOnly(): string {
    const { notes } = this.snapshot();
    const metas = this.archivedMetas();
    const tokens = this.rebuildDigest(metas, notes.length);
    return `摘要 ${DIGEST_NAME} 重写完成：${metas.length} 条，约 ${humanTokens(tokens)}。`;
  }

  // ---- 自动 ----

  /** 每轮之后看一眼：到点了、笔记超了、不忙，就归档一次。 */
  onTurnEnded(): void {
    if (this.cfg().autoCompact === false) return;
    if (this.busy) return;
    const now = Date.now();
    if (now - this.lastAuto < intervalMs(this.cfg())) return;
    this.lastAuto = now;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.autoRun();
    }, 1500);
    this.timer.unref?.();
  }

  private autoRun(): void {
    if (this.busy) return;
    const { notes } = this.snapshot();
    if (notes.length <= this.keep()) return;
    this.busy = true;
    try {
      const text = this.compact(true);
      this.log(`auto: ${text.split('\n')[0]}`);
    } catch (error) {
      this.log(`auto failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.busy = false;
    }
  }

  // ---- World 契约 ----

  envPromptVars(): Record<string, string> {
    const digestBytes = existsSync(this.digestPath) ? statSync(this.digestPath).size : 0;
    const digestTokens = digestBytes ? estimateTokens(readText(this.digestPath)) : 0;
    return {
      'slim.digest': 'handoffs/DIGEST.md',
      'slim.archive': this.archiveDir,
      'slim.digest_tokens': digestBytes ? humanTokens(digestTokens) : '还没生成',
    };
  }

  tools(): ToolDef[] {
    const t = slimText(this.opts.language?.());
    return [
      {
        name: 'slim_report',
        description:
          '看一眼工作区现在有多厚、交接笔记堆了多少、归档能省多少。' +
          '只读，不带副作用；想省 token 又拿不准该不该整理时先调它。',
        tags: ['read'],
        parameters: { type: 'object', properties: {} },
        handler: async () => this.report(),
      },
      {
        name: 'slim_compact',
        description:
          '把 handoffs/ 里超出保留份数的旧交接笔记搬进工作区外的归档，并重写 handoffs/DIGEST.md 摘要。' +
          '原文不删；CONSTITUTION.md、PARTNER.md 等你自己写的东西一概不动。' +
          '不传 apply 时只返回计划、不动文件；要真做就传 apply: true。',
        tags: ['write'],
        parameters: {
          type: 'object',
          properties: {
            apply: { type: 'boolean', description: 'true = 真的归档；省略或 false = 只给计划。' },
          },
        },
        handler: async (args) => this.compact(args.apply === true),
      },
      {
        name: 'slim_digest',
        description:
          '只重写 handoffs/DIGEST.md 摘要，不搬任何文件。归档目录里新加了东西、或摘要被改乱了，用它重建。',
        tags: ['read'],
        parameters: { type: 'object', properties: {} },
        handler: async () => this.digestOnly(),
      },
    ];
  }

  webUi(language: Language = 'zh'): WorldWebUiDecl {
    const t = slimText(language);
    return {
      label: t.label,
      lamps: [
        {
          label: t.label,
          state: this.busy ? 'loading' : this.cfg().autoCompact === false ? 'offline' : 'online',
          hint: this.busy ? t.lamps.busy : this.cfg().autoCompact === false ? t.lamps.off : t.lamps.on,
        },
      ],
      config: slimConfigGroups(language),
      promptDocs: [
        {
          key: `worlds.${SLIM_ID}.envPrompt`,
          title: t.envPrompt.title,
          description: t.envPrompt.description,
          path: ENV_PROMPT_FILE,
          role: 'envPrompt',
          vars: [
            { name: 'slim.digest', description: '摘要文件在工作区里的相对路径。' },
            { name: 'slim.archive', description: '归档目录的绝对路径。' },
            { name: 'slim.digest_tokens', description: '摘要现在多大。' },
          ],
        },
      ],
    };
  }

  async start(host: WorldHost): Promise<void> {
    this.host = host;
    host.log.info(`slim: 工作区 ${this.workspace}`);
    // 启动时先做一次，别等第一轮说完话。
    this.lastAuto = Date.now();
    this.busy = true;
    try {
      const { notes } = this.snapshot();
      if (notes.length > this.keep()) {
        const text = this.compact(true);
        host.log.info(`slim: ${text.split('\n')[0]}`);
      } else if (notes.length) {
        this.rebuildDigest(this.archivedMetas(), notes.length);
      }
    } catch (error) {
      host.log.warn(`slim: 启动整理失败 ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.busy = false;
    }
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.host = null;
  }
}
