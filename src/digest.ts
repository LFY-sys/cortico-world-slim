/**
 * 把交接笔记折成摘要：只读文本，产出 markdown，不做 I/O。
 *
 * 一条摘要只留四样东西，都是"要不要回去翻原文"的判断依据：时间、体量、聊过哪些小节、
 * 动过哪些工具、开头那一段。正文细节留在归档里，需要时按日期去取。
 *
 * 摘要用到的这几样在归档的时候就抽成 NoteMeta 存进 index.json；以后重建 DIGEST.md
 * 只读这份小索引，不再把几十 KB 的原文重新读一遍。
 */
import { estimateTokens, humanTokens } from './scan.ts';

export interface DigestOptions {
  /** 每条摘要最多多少 token。 */
  digestTokens: number;
  /** 生成时刻。 */
  now: Date;
  /** 归档目录的绝对路径，写进摘要方便原文追踪。 */
  archiveDir: string;
  /** 仍在 handoffs/ 里没归档的份数。 */
  liveCount: number;
}

/** 一份已归档笔记的摘要素材。 */
export interface NoteMeta {
  /** 文件名里的 UTC 戳（去掉 .md）。 */
  stamp: string;
  tokens: number;
  bytes: number;
  outline: string[];
  tools: Array<[string, number]>;
  opening: string;
}

/** 文件名里的 `2026-10-27T03-40-20Z` → `2026-10-27 03:40`；认不出原样返回。 */
export function humanStamp(stamp: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-\d{2}Z$/.exec(stamp);
  return m ? `${m[1]} ${m[2]}:${m[3]}` : stamp;
}

/**
 * 小节标题：`#` 开头的行，取前 6 个。
 * 笔记里大量标题只是时间戳（`## 22:51`）或每份都一样的固定头，这类不算"聊了什么"，跳过。
 */
function outlineOf(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^#{1,3}\s+(.+?)\s*$/.exec(line);
    if (!m || !m[1]) continue;
    const title = m[1].trim();
    if (/^\d{1,2}[:：]\d{2}(\s*[-–~]\s*\d{1,2}[:：]\d{2})?$/.test(title)) continue;
    if (title.startsWith('交接笔记')) continue;
    if (out.includes(title.slice(0, 40))) continue;
    out.push(title.slice(0, 40));
    if (out.length >= 6) break;
  }
  return out;
}

/** 动过的工具：笔记里 `[调用] 名字` 的出现次数，取前 6。 */
function toolsOf(text: string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/\[调用\]\s*([\w.-]+)/g)) {
    if (!m[1]) continue;
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

/** 去掉标题、调用行与折叠/引用噪音后的开头一段，压成一行。 */
function openingOf(text: string, maxChars: number): string {
  const kept: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw
      .replace(/\[后面约 \d+ token 已折叠\]/g, '')
      .replace(/\[blob [^\]]*\]/g, '')
      .trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('[调用]') || line.startsWith('[回执]')) continue;
    if (line.startsWith('>')) continue;
    if (line.startsWith('[system]')) continue;
    if (line.startsWith('这一段已经过去了')) continue;
    if (/^Dream message reference/i.test(line)) break;
    if (/^\{.*\}$/.test(line)) continue;
    kept.push(line.replace(/\s+/g, ' '));
    if (kept.join(' ').length >= maxChars) break;
  }
  const joined = kept.join(' ').replace(/\s+/g, ' ').trim();
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined;
}

/** 从原文抽一份摘要素材。 */
export function metaOf(text: string, stamp: string, bytes: number): NoteMeta {
  return {
    stamp,
    tokens: estimateTokens(text),
    bytes,
    outline: outlineOf(text),
    tools: toolsOf(text),
    opening: openingOf(text, 220),
  };
}

/** 一条摘要。 */
export function digestEntry(meta: NoteMeta, budgetTokens: number): string {
  const maxChars = Math.max(80, Math.round(budgetTokens * 1.6));
  const lines: string[] = [];
  lines.push(`### ${humanStamp(meta.stamp)} · ${humanTokens(meta.tokens)} · ${(meta.bytes / 1024).toFixed(1)}KB`);
  if (meta.outline.length) lines.push(`- 小节：${meta.outline.join(' / ')}`);
  if (meta.tools.length) lines.push(`- 工具：${meta.tools.map(([name, n]) => (n > 1 ? `${name}×${n}` : name)).join('、')}`);
  if (meta.opening) {
    const opening = meta.opening.length > maxChars ? `${meta.opening.slice(0, maxChars)}…` : meta.opening;
    lines.push(`- 开头：${opening}`);
  }
  return lines.join('\n');
}

/** 整份 DIGEST.md。 */
export function buildDigest(metas: NoteMeta[], opts: DigestOptions): string {
  const total = metas.reduce((sum, m) => sum + m.tokens, 0);
  const head = [
    '# 交接笔记摘要',
    '',
    `> 由「上下文瘦身」自动维护：${opts.now.toISOString().replace('T', ' ').slice(0, 16)} UTC。`,
    `> handoffs/ 里还留着 ${opts.liveCount} 份原文；下面这 ${metas.length} 份已归档，原文在 \`${opts.archiveDir}\`。`,
    `> 归档前合计约 ${humanTokens(total)}；读这份摘要够用来接上前面的事，要细节再按日期去归档里找。`,
    '',
    '',
  ].join('\n');
  if (!metas.length) return `${head}（还没有归档的笔记。）\n`;
  const body = metas
    .slice()
    .sort((a, b) => a.stamp.localeCompare(b.stamp))
    .map((m) => digestEntry(m, opts.digestTokens))
    .join('\n\n');
  const tokens = estimateTokens(head + body);
  return `${head}${body}\n\n---\n摘要本身约 ${humanTokens(tokens)}。\n`;
}

/** 报告里那句"能省多少"。 */
export function savingLine(before: number, after: number): string {
  if (before <= 0) return '没有可省的';
  const ratio = Math.round((1 - after / before) * 100);
  return `约 ${humanTokens(before)} → ${humanTokens(after)}（省 ${ratio}%）`;
}
