# Changelog

## 2026-05-30

- Initial workspace created


## 2026-05-30

Created Cache Trace ticket, wrote design/diary, implemented extension, and validated extension loading (code commit 823a3ef).

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/cache-trace/index.ts — New Cache Trace extension entrypoint
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/30/PI-EXT-CACHE-TRACE--pi-extension-for-llm-cache-usage-timeline-and-analytics/design-doc/01-cache-trace-extension-design-and-implementation-guide.md — Intern-facing design guide


## 2026-05-30

Uploaded the design bundle to reMarkable and completed an interactive tmux modal smoke test; live print-mode LLM smoke timed out and remains a follow-up.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/30/PI-EXT-CACHE-TRACE--pi-extension-for-llm-cache-usage-timeline-and-analytics/reference/01-diary.md — Records reMarkable upload and tmux smoke results
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/30/PI-EXT-CACHE-TRACE--pi-extension-for-llm-cache-usage-timeline-and-analytics/tasks.md — Tracks remaining live-model smoke test


## 2026-05-30

Completed live two-prompt tmux smoke test and fixed Cache Trace feedback turns by deferring visible timeline cards until Pi is idle (commit 5a0003f).

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/cache-trace/index.ts — Defers timeline custom messages until ctx.isIdle()
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/30/PI-EXT-CACHE-TRACE--pi-extension-for-llm-cache-usage-timeline-and-analytics/reference/01-diary.md — Records live smoke test and feedback-loop fix
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/30/PI-EXT-CACHE-TRACE--pi-extension-for-llm-cache-usage-timeline-and-analytics/tasks.md — Marks live-model smoke test done


## 2026-05-30

Changed Cache Trace timeline custom_message content to an empty string and render from details metadata, minimizing LLM-context pollution while preserving visible cards.

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/cache-trace/README.md — Documents empty-content metadata rendering
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/cache-trace/index.ts — Timeline custom messages now store record only in details metadata
- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/30/PI-EXT-CACHE-TRACE--pi-extension-for-llm-cache-usage-timeline-and-analytics/design-doc/01-cache-trace-extension-design-and-implementation-guide.md — Updates context-pollution guidance

