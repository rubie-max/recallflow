# RecallFlow staged roadmap

Preserve the React design, local question/progress/report storage and free static-hosting compatibility. Deliver and browser-test each stage before proceeding.

## Completed

- Migration from Floot to local React development and a static deployment build.
- Browser Kokoro speech with WebGPU/WASM, five voices, speed controls, persistent audio-only IndexedDB caching and compact quiz speakers.
- Question library search, type/subject filters, expandable answer cards and delete confirmation.
- Expanded Settings: explicit voice/speed saving, quiz count/shuffle defaults, full data backup export/copy, and generated-audio usage/clearing.

## Stage 1 — completed 2026-10-04

- True/False, Multi-select and Numeric Answer, including numeric tolerance.
- Add/edit/import validation for new types and multiple-choice options.
- Retry mistakes from quiz results and saved reports, with separate linked practice reports.
- Preserve existing four types, questions, progress, reports, streaks, theme and speech.

## Learning increment — completed 2026-10-04

- Matching, ordering and multi-blank/cloze; image prompts and image answer choices.
- Accepted alternatives and conservative one-edit typo grading.
- Quiz count, subject/topic/types/shuffle/weak/mistakes with Daily/Due/All scheduling.
- Adaptive intervals and weak subject/topic/type, trends, response-time and repeated-mistake analytics.
- Tags, sorting, duplicate detection and full local backup restore.
- PWA manifest and offline app-shell caching; browser offline study verified.
- Temporary personal lock removed at user request. Secure single-owner login is deferred to the final hosting stage.

## Remaining optional stages

- Longer free recall, keyword grading and per-blank alternative answers.
- Labeling/hotspots, richer diagrams, shared knowledge items and generated variants.
- Recognition-versus-recall analytics, difficulty controls and richer activity history.
- Cloud sync/accounts remain explicitly postponed.

Existing voice features are preserved; this increment does not change TTS.
