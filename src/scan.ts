/**
 * 扫工作区、估 token：都是只读函数，不碰文件内容以外的状态。
 *
 * token 估算是保守的近似（中文按字、其余按 3.6 字符一个），只用来判断"这堆东西值不值得读"，
 * 不追求和真实分词器完全一致——差个百分之十几不影响要不要归档。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** 不进统计的目录：版本库元数据、依赖、二进制附件。 */
const SKIP_DIR = new Set(['.git', 'node_modules', 'blobs', '.blobs']);

/** 只统计纯文本，二进制读进来也是噪声。 */
const TEXT_EXT = new Set(['.md', '.txt', '.json', '.jsonl', '.yaml', '.yml', '.csv', '.log', '.html', '.py', '.js', '.ts']);

const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;

export interface FileStat {
  /** 相对工作区，用 `/` 分隔。 */
  rel: string;
  bytes: number;
  /** 估算 token。 */
  tokens: number;
  /** 改成毫秒时间戳，方便排序。 */
  mtime: number;
}

/** 估 token：中日韩字符按 1，其余按 3.6 字符一个。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(CJK) ?? []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk + rest / 3.6);
}

/** 读文件，读不了就当空。 */
export function readText(abs: string): string {
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    return '';
  }
}

/** 递归列出工作区里的文本文件；坏链接、无权限目录跳过。 */
export function walkWorkspace(root: string): FileStat[] {
  const out: FileStat[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIR.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const dot = entry.name.lastIndexOf('.');
      const ext = dot < 0 ? '' : entry.name.slice(dot).toLowerCase();
      if (!TEXT_EXT.has(ext)) continue;
      let size = 0;
      let mtime = 0;
      try {
        const st = statSync(abs);
        size = st.size;
        mtime = st.mtimeMs;
      } catch {
        continue;
      }
      const tokens = estimateTokens(readText(abs));
      out.push({ rel: relative(root, abs).split(sep).join('/'), bytes: size, tokens, mtime });
    }
  };
  walk(root);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

/** 交接笔记：`handoffs/` 下的 .md，文件名是按时间排的戳，字典序即时间序。 */
export interface NoteStat extends FileStat {
  /** 文件名里的 UTC 戳（去掉了 .md）；认不出形状就是文件名本身。 */
  stamp: string;
}

export function handoffNotes(root: string, files: FileStat[]): NoteStat[] {
  return files
    .filter((f) => /^handoffs\/[^/]+\.md$/.test(f.rel))
    .map((f) => ({ ...f, stamp: f.rel.slice('handoffs/'.length, -3) }))
    .sort((a, b) => a.rel.localeCompare(b.rel));
}

/** 把 token 数说成人话。 */
export function humanTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens} token`;
  return `${(tokens / 1000).toFixed(1)}k token`;
}

/** 按顶层目录汇总，报告里用。 */
export function groupStats(files: FileStat[]): Array<{ group: string; files: number; tokens: number; bytes: number }> {
  const map = new Map<string, { files: number; tokens: number; bytes: number }>();
  for (const f of files) {
    const group = f.rel.includes('/') ? f.rel.slice(0, f.rel.indexOf('/')) : '(根目录)';
    const slot = map.get(group) ?? { files: 0, tokens: 0, bytes: 0 };
    slot.files += 1;
    slot.tokens += f.tokens;
    slot.bytes += f.bytes;
    map.set(group, slot);
  }
  return [...map.entries()]
    .map(([group, v]) => ({ group, ...v }))
    .sort((a, b) => b.tokens - a.tokens);
}
