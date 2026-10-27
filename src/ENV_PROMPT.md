工作区里的 `handoffs/` 是每次上下文交接时自动写下的笔记，越积越厚；`{{slim.digest}}` 是这些笔记的摘要，现在约 {{slim.digest_tokens}}。

想接上前几天的事，先读摘要，不要一上来就逐份读原文——原文单份就可能是几万 token。摘要里没有的细节，再按日期去归档目录 `{{slim.archive}}` 找那一份。

觉得摘要太粗、或者它好久没更新了，调用 `slim_compact`（传 `apply: true` 才真动手）；只想先看看能省多少，调用 `slim_report`。`CONSTITUTION.md`、`PARTNER.md`、`partner/`、`log/` 不会被动。
