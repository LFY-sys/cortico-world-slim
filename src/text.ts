/** 这个包的全部给人看的字：界面、配置说明、工具回执。中文为主，英文对照。 */
import type { Language } from 'cortico/core/language.ts';

export interface SlimText {
  label: string;
  lamps: { on: string; off: string; busy: string };
  config: {
    title: string;
    autoCompact: string;
    autoCompactHint: string;
    keepHandoffs: string;
    keepHandoffsHint: string;
    minInterval: string;
    minIntervalHint: string;
    digestTokens: string;
    digestTokensHint: string;
  };
  envPrompt: { title: string; description: string };
}

const ZH: SlimText = {
  label: '上下文瘦身',
  lamps: { on: '待命', off: '关着', busy: '正在整理' },
  config: {
    title: '瘦身节奏',
    autoCompact: '每轮自动整理',
    autoCompactHint: '每轮说完话后检查工作区：交接笔记多出来的归档、摘要顺手更新。只动 handoffs/，不碰你自己写的东西。',
    keepHandoffs: '留几份原文',
    keepHandoffsHint: 'handoffs/ 里保留最近的几份原文，更旧的移进归档目录（原文不删，只是搬出工作区）。',
    minInterval: '最短间隔（分钟）',
    minIntervalHint: '两次自动整理之间至少隔多久，免得每轮都扫一遍盘。',
    digestTokens: '摘要每条多少 token',
    digestTokensHint: '摘要里每条旧笔记最多占多少 token；越小越省，细节也越少。',
  },
  envPrompt: {
    title: '上下文瘦身 · 环境提示词',
    description: '告诉她 handoffs/DIGEST.md 是什么、什么时候读摘要而不是读原文。',
  },
};

const EN: SlimText = {
  label: 'Slim Context',
  lamps: { on: 'idle', off: 'off', busy: 'folding' },
  config: {
    title: 'Slimming',
    autoCompact: 'Fold after every turn',
    autoCompactHint: 'After each turn, archives surplus handoff notes and refreshes the digest. Touches only handoffs/.',
    keepHandoffs: 'Notes kept in full',
    keepHandoffsHint: 'How many recent handoffs stay in handoffs/; older ones move to the archive (nothing is deleted).',
    minInterval: 'Minimum interval (min)',
    minIntervalHint: 'Least time between automatic passes.',
    digestTokens: 'Tokens per digest entry',
    digestTokensHint: 'Upper bound for one archived note in the digest.',
  },
  envPrompt: {
    title: 'Slim Context · env prompt',
    description: 'What handoffs/DIGEST.md is and when to read it instead of the full notes.',
  },
};

export function slimText(language?: Language): SlimText {
  return language === 'en' ? EN : ZH;
}
