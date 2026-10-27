/** World 定义：装配层挂它、Core 构造它。 */
import type { Language } from 'cortico/core/language.ts';
import type { WorldDefinition, WorldDescribe } from 'cortico/world.ts';
import { SLIM_DEFAULTS, SLIM_ID, slimConfigGroups, type SlimConfigSection } from './config.ts';
import { slimText } from './text.ts';
import { SlimWorld } from './world.ts';

export interface SlimAssembly {
  language?(): Language;
}

const REPORT_DESCRIPTION =
  '看一眼工作区现在有多厚、交接笔记堆了多少、归档能省多少。' +
  '只读，不带副作用；想省 token 又拿不准该不该整理时先调它。';
const COMPACT_DESCRIPTION =
  '把 handoffs/ 里超出保留份数的旧交接笔记搬进工作区外的归档，并重写 handoffs/DIGEST.md 摘要。' +
  '原文不删；CONSTITUTION.md、PARTNER.md 等你自己写的东西一概不动。' +
  '不传 apply 时只返回计划、不动文件；要真做就传 apply: true。';
const DIGEST_DESCRIPTION =
  '只重写 handoffs/DIGEST.md 摘要，不搬任何文件。归档目录里新加了东西、或摘要被改乱了，用它重建。';

const DESCRIBE: WorldDescribe = {
  tools: [
    {
      name: 'slim_report',
      description: REPORT_DESCRIPTION,
      tags: [],
      parameters: { type: 'object', properties: {} },
      summary: { zh: '体检工作区与交接笔记，估算归档能省多少。', en: 'Measure the workspace and handoffs, estimate the saving.' },
    },
    {
      name: 'slim_compact',
      description: COMPACT_DESCRIPTION,
      tags: [],
      parameters: {
        type: 'object',
        properties: {
          apply: { type: 'boolean', description: 'true = 真的归档；省略或 false = 只给计划。' },
        },
      },
      summary: { zh: '归档旧交接笔记并重写摘要（需 apply: true 才动手）。', en: 'Archive old handoff notes and rewrite the digest (needs apply: true).' },
    },
    {
      name: 'slim_digest',
      description: DIGEST_DESCRIPTION,
      tags: [],
      parameters: { type: 'object', properties: {} },
      summary: { zh: '只重写 handoffs/DIGEST.md，不搬文件。', en: 'Rewrite handoffs/DIGEST.md only.' },
    },
  ],
  events: [],
};

/** 定义，带嵌入方借给它的语言。 */
export function slimDefinition(assembly: SlimAssembly = {}): WorldDefinition<SlimConfigSection> {
  return {
    id: SLIM_ID,
    get label() {
      return slimText(assembly.language?.()).label;
    },
    defaults: () => structuredClone(SLIM_DEFAULTS),
    describe: DESCRIBE,
    create: (ctx) =>
      new SlimWorld({
        cfg: ctx.cfg,
        botDir: ctx.botDir,
        dataDir: ctx.dataDir,
        language: () => assembly.language?.() ?? 'zh',
      }),
    configOptions: () => [],
  };
}

/** 没有嵌入方的定义：中文。 */
export const SLIM = slimDefinition();

export { slimConfigGroups };
