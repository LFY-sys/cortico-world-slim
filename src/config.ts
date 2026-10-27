/**
 * `worlds.slim` 配置段：瘦身什么时候做、留几份原文、摘要多长。
 *
 * 键都挂在 `worlds.slim` 下面，WebUI 的 World 页按这些路径渲染；`x-hot` 的项改完
 * 立即生效，其余要重启这个 World。
 */
import type { Language } from 'cortico/core/language.ts';
import type { ConfigGroup } from 'cortico/core/config-schema.ts';
import { slimText } from './text.ts';

export const SLIM_ID = 'slim';

export interface SlimConfigSection {
  [key: string]: unknown;
  /** 整套挂不挂载；框架读这个。 */
  enabled: boolean;
  /** 每轮结束后自动瘦身；关掉后只能靠工具手动做。 */
  autoCompact: boolean;
  /** `handoffs/` 里留几份最近的原文，其余归档。 */
  keepHandoffs: number;
  /** 两次自动瘦身之间至少隔多久，避免每轮都扫盘。 */
  minIntervalMinutes: number;
  /** 摘要里每条旧笔记最多占多少 token。 */
  digestTokens: number;
}

export const SLIM_DEFAULTS: SlimConfigSection = {
  enabled: true,
  autoCompact: true,
  keepHandoffs: 3,
  minIntervalMinutes: 30,
  digestTokens: 120,
};

/** 用户填的数可能越界或不是数：收进安全区间。 */
export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** 每轮触发自动瘦身的门槛，单位毫秒。 */
export function intervalMs(cfg: Partial<SlimConfigSection>): number {
  return clampInt(cfg.minIntervalMinutes, SLIM_DEFAULTS.minIntervalMinutes, 1, 24 * 60) * 60_000;
}

/** WebUI 的配置分组；键是 `worlds.slim` 下的路径。 */
export function slimConfigGroups(language: Language = 'zh'): ConfigGroup[] {
  const t = slimText(language).config;
  const at = (key: string): string => `worlds.${SLIM_ID}.${key}`;
  return [
    {
      id: `world:${SLIM_ID}.policy`,
      owner: `world:${SLIM_ID}`,
      schema: {
        type: 'object',
        title: t.title,
        properties: {
          [at('autoCompact')]: {
            type: 'boolean',
            title: t.autoCompact,
            description: t.autoCompactHint,
            'x-hot': true,
          },
          [at('keepHandoffs')]: {
            type: 'integer',
            title: t.keepHandoffs,
            description: t.keepHandoffsHint,
            minimum: 1,
            maximum: 20,
            'x-hot': true,
          },
          [at('minIntervalMinutes')]: {
            type: 'integer',
            title: t.minInterval,
            description: t.minIntervalHint,
            minimum: 1,
            maximum: 1440,
            'x-hot': true,
          },
          [at('digestTokens')]: {
            type: 'integer',
            title: t.digestTokens,
            description: t.digestTokensHint,
            minimum: 40,
            maximum: 600,
            'x-hot': true,
          },
        },
      },
    },
  ];
}
