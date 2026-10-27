# 更新记录

## 0.1.0

- 第一个版本：`slim_report` / `slim_compact` / `slim_digest` 三个工具。
- 交接笔记按份数归档到 `data/slim-archive/handoffs/`，原文不删，索引只存摘要元数据。
- `handoffs/DIGEST.md` 由归档索引重建，环境提示词里自动带上摘要与归档路径。
- 启动时与每轮对话后各检查一次，可关（`autoCompact` / `archiveOnBoot`）。
