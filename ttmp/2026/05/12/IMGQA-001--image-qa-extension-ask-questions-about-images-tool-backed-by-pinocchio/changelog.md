# Changelog

## 2026-05-12

- Initial workspace created


## 2026-05-12

Step 1: Created ticket IMGQA-001, design doc, tasks, and diary for image-qa extension

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/ttmp/2026/05/12/IMGQA-001--image-qa-extension-ask-questions-about-images-tool-backed-by-pinocchio/design/01-extension-design.md — Design doc with tool contract


## 2026-05-12

Step 2: Implemented image-qa extension (commit 2d8a111) — index.ts + README.md, loads cleanly

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/README.md — User-facing docs
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/index.ts — Tool registration + settings + command


## 2026-05-12

Step 3: Symlinked to ~/.pi/agent/extensions/image-qa, validated load (pi --list-models passes), all tasks complete

### Related Files

- /home/manuel/.pi/agent/extensions/image-qa — Symlink to extension directory


## 2026-05-12

Step 4: Smoke tested via tmux — /image-qa command works, /px launcher shows Image QA, ask_questions_about_images tool registered and functional (identified red rectangle correctly)


## 2026-05-12

Step 5: Wrote docs/pi-testing-guide.md (commit 8a4e7b8) — practical guide for load checks, tmux smoke tests, pitfalls, and checklist

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/docs/pi-testing-guide.md — Reusable testing guide for Pi extensions


## 2026-05-12

Step 6: Clarified image-qa tool docs for multi-image comparisons such as before/after screenshots

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/README.md — README now includes before/after multi-image example
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/index.ts — Tool description


## 2026-05-12

Step 6: Clarified image-qa docs for multi-image comparisons and VLM limitations (interpretations, not perfect visual ground truth)

### Related Files

- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/README.md — README now documents VLM limitations and updated before/after example
- /home/manuel/code/wesen/2026-04-21--pi-extensions/extensions/image-qa/index.ts — Tool docs now mention multi-image before/after use and VLM uncertainty

