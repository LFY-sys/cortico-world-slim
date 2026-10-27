export { SLIM, slimDefinition, type SlimAssembly } from './definition.ts';
export { SLIM_DEFAULTS, SLIM_ID, clampInt, intervalMs, slimConfigGroups, type SlimConfigSection } from './config.ts';
export { SlimWorld } from './world.ts';
export { estimateTokens, walkWorkspace, handoffNotes, humanTokens, groupStats } from './scan.ts';
export { buildDigest, metaOf, digestEntry, savingLine, type NoteMeta } from './digest.ts';
export { slimText, type SlimText } from './text.ts';
// 装载器按默认导出取 World 定义
export { SLIM as default } from './definition.ts';
