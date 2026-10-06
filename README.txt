RecallFlow — React local development project

Original Floot source version: 1791012573023
Project: 1c09534f-f4f4-4a85-b62d-bc15b157a939

The active app uses React and TypeScript. src/react contains the original page,
components, styles, and theme helper with local Kokoro integration.
floot-original preserves the fetched source before changes.
source-baseline preserves the single-file app supplied in RecallFlow_latest.zip.
The ZIP had no React source folders; those were recovered directly from Floot.

Install and run with Node 24:
  npm install
  npm run dev
Or use pnpm install and pnpm dev.

The live preview is http://127.0.0.1:5173/.
The server listens only on this PC, rebuilds on source edits, and reloads the
browser after a successful build. The original UI is preserved, with Kokoro
voice and speed settings plus compact speaker buttons in quizzes.

Build for GitHub Pages:
  npm run build
Publish the contents of dist/ as the GitHub Pages site.
All app, worker, model-library, logo, and stylesheet paths are relative, so the
build supports a repository subdirectory. Model files download from Hugging
Face into browser caches, not from this repository. Fonts use Google Fonts.
No backend server or API key is needed for the published app.

Speech:
Kokoro 82M runs in a dedicated browser worker. Automatic mode probes WebGPU and
uses fp32; GPU initialization/inference failure retries Kokoro WASM q8. A forced
WASM option makes compatibility testing explicit. Settings can switch to the browser's built-in device voice instead (see 2026-10-06 below).
Five voices are available: Heart (default), Bella, Michael, Fenrir and Emma. Preview a draft voice/speed in Settings, then click Save voice settings to persist it for quiz speakers. Speeds range from 0.8x to 1.2x. Unsaved changes are discarded on refresh.
Stop audio and navigation cancel playback; stale generations do not auto-play.
Question prompts, flashcard fronts/backs and correct-answer feedback have speakers.
Audio is generated only on request, never automatically for the entire bank.
Generated WAV blobs are stored in IndexedDB (recallflow-kokoro-audio/audio).
Keys include item ID, question/answer role, exact text, voice, speed, processing
mode, model, library version and cache version. Voice changes retain older audio.
Edits get new keys. Deleting a question removes associated audio where storage
is available. Requests deduplicate and inference runs serially; playback is single.
Storage/quota failure still permits playback and memory caching, with a message.
Normal model-library Cache Storage is enabled; cache hits need no model/inference.
Browser storage can be cleared/evicted; these local caches are not cloud backups.
Run node audio-tests.mjs for request/cache/error-path regression checks.

Verification:
react-webgpu-playback.json and react-wasm-playback.json contain browser playing
and ended events, duration, waveform RMS/peak, volume, and mute evidence.
audio-cache-browser-tests.json records all five voices, speed changes, separate question/answer audio, editing, refresh persistence, and a successful quiz export. First Heart playback including download took about 59 seconds; repeat lookup took 10 ms. After refresh, a saved sample took 18 ms with zero inference and no worker. WebGPU and WASM both completed the new 3.8-second preview.
Browser playback proves the media player ran; it does not measure speaker
hardware or provide a subjective listening assessment.

Storage:
The original app stores questions, interval/due metadata, quiz reports, streaks,
and theme in localStorage. These keys are preserved. The local preview cannot
access storage belonging to the Floot domain; no existing Floot browser data was
transferred. The current bundled bank has four demo questions.
Changing browser, device, or site address starts a separate local store.

Additional fixes:
Multiple-choice reports record the chosen answer without a stale state value.
An empty question bank persists correctly and cannot launch an empty quiz.
Deleted demo questions are not silently restored. Imports validate question
types/content before appending entries; React renders text safely.

Hosting status: local live preview only; not published to GitHub yet.

Theme indicator now synchronizes with the saved theme after refresh.
Fill-blank speakers say blank instead of reading underscore punctuation.

Stage 1 (2026-10-04): True/False, Multi-select, Numeric Answer and Retry mistakes.
Retry practice creates a separate report linked by source_report_id; original reports remain intact. Deleted questions are excluded, and current saved versions are used.
Multi-select uses options plus a correctAnswers array in JSON; all correct choices and no extras must be selected. Numeric answers use a finite decimal/scientific number and optional numericTolerance (default 0). True/False uses answer True or False.
Manual editing/importing validate all new types and multiple-choice choices. Existing localStorage keys and default demo bank are unchanged.
Tests: npm test. Browser proof: stage-1-browser-tests.json. Remaining stages: ROADMAP.md.

Expanded Settings (2026-10-04): explicit voice/speed saving with confirmation;
quiz length (all questions or a chosen count) and shuffle defaults with Save;
Download data backup and Copy backup JSON; saved-speech usage and confirmed clearing.
Quiz defaults apply to new ordinary quizzes. Retry mistakes includes all available misses.
Backup exports questions, reports, quiz count, streaks, theme and saved preferences.
Full-backup restoration is available in Settings. Generated audio/model files are excluded.
Clearing saved speech removes generated audio only, preserves learning data, and
retains downloaded model files. Future speech regenerates when requested.
Settings are browser-local, with no cloud sync. Proof: settings-browser-tests.json
and settings-backup-test.json. Question, settings and audio tests run with npm test.

Settings design refresh: compact icon headings, quieter secondary actions, shuffle switch, clear save rows, responsive button layouts and visible keyboard focus. Voice, quiz and storage behavior is preserved.

Quiz design refresh: readable question typography, larger answer choices, correct/incorrect choice highlighting, stacked feedback and Next question/See results actions. Flashcards retain flip/self-grading controls. Tested typed answers, fill blanks, multiple choice and flashcards in light/wide and dark/narrow previews.

Question library refresh: prompt-focused cards with expandable answers, text search across questions/answers/subjects/topics, combined type and subject filters, reset/empty results states, and inline delete confirmation. Search/filtering does not change the saved bank. Browser verification: questions-library-tests.json.

Chosen quiz layout: B on desktop (side-by-side question and answer panels, breakpoint 820px) and B1 on mobile (stacked cards). Multiple-choice and True/False now select first and submit with Check answer. Native radio controls support keyboard navigation; multi-select retains explicit submission. Kokoro, flashcard self-grading, numeric tolerance, reports and retry behavior remain. B1-browser-tests.json verifies all seven types, recorded choice, and completed browser audio.

Voice polish (2026-10-04): draft voice/speed with Save and Cancel, unsaved-change
indicator, and one contextual Preview/Stop button. Leaving Settings or refreshing
restores saved preferences. Existing saved voice/speed remain unchanged.
Voice cache sits directly below speech settings and updates after generation or
clearing. Confirmed clearing releases generated clips and preserves study data,
preferences and downloaded model files. Compatibility details are collapsed.
Quiz speakers show generation/playback status, stop on a second tap and switch
playback without overlapping audio. Flashcard flips never auto-play speech.
All 18 requested browser checks passed: voice-polish-browser-tests.json.
Before/after QA backups confirm study data preservation during cache clearing.

Learning features (2026-10-04):
- Local PNG/JPEG/WebP image prompts and answer choices (2 MB per image).
  Images are embedded in question JSON, remain offline and travel with backups.
- Matching: pairs [{left,right}]; Ordering: sequence [steps in correct order].
- Cloze: prompt with ___ markers and blanks [answers in marker order].
- Text acceptedAnswers [alternatives]; fuzzy false disables typo acceptance.
  One edit is accepted only for words of at least five characters with no digits.
  This is conservative typo detection, not semantic/AI grading.
- Quiz builder: Daily, Due, All; count, subject, topic, types, shuffle and weak/mistake focus.
  Daily selects due/new questions with older due dates first. Due selects due/new
  questions. All allows practice regardless of schedule. Correct intervals grow
  by 2.2x, from 1 day to a maximum 365; wrong answers become due today.
- Reports include grading category and response times. Insights group accuracy
  by subject/topic/type, show the last twelve reports and repeated mistakes.
- Library tags, sorting and normalized prompt/answer/type duplicate detection.
- Full backup review/restore validates data before replacement, preserves the
  unrelated storage and rolls back writes if browser storage is full.
- Installable manifest and service worker cache the local app shell and icons.
  Open online once before offline study. Installation depends on browser support.

Personal login postponed until the app is finished. The temporary browser lock
and its Settings controls have been removed. Final hosting should use a secure
single-owner server login, with credentials held in private server configuration,
no signup or password-changing UI, and no study-data sync unless requested.

Verification: learning-tests.mjs covers grading, schedule, filters, analytics,
backup validation/restore and quota rollback. learning-features-browser-tests.json
records real matching/order/cloze quizzes, images, typo/alternative answers, due
and weak filters, editor image upload, report analytics, backup round trip, and
offline reload/quiz/report persistence with the isolated server stopped. Existing
question/settings/audio regression tests pass. No TTS changes in this increment.

Mobile quiz refresh: one continuous question/answer surface, compact metadata,
large readable controls, a fixed bottom action with safe-area padding, two-column
image choices and cloze inputs, compact matching rows and sequence controls.
Phone quizzes return to the top on the next question and bring feedback into view.
All 11 sample layouts passed at 390x844 without horizontal overflow; every sample
was answered correctly in an isolated browser quiz. See mobile-quiz-layout-tests.json.

Matching and sentence blanks: matching now uses tap-to-connect left/right tiles,
numbered pairs and SVG connecting lines, one-to-one reassignment, reset and graded
colors. Single fill-blank and multi-blank/cloze inputs appear in the original
sentence. Existing answers, grading and import fields are unchanged. Browser
proof: matching-and-inline-blanks-browser-tests.json; three-question quiz passed.

New separate type: fill_blank_options (Fill blanks with options). Use ___ markers,
a blanks array with the correct answers in marker order, and an options array
containing every correct answer plus optional distractors. Options may be reused
across gaps. The UI selects a gap, fills it from the word bank and permits clearing
or changing it before checking. Exact ordered answers are graded; this type has
its own filters and analytics label. Both one/multiple-gap samples and manual
authoring passed browser tests. See word-bank-tests.mjs and word-bank-browser-tests.json.

Settings voice previews now use five bundled prerecorded WAV samples in public/voice-previews/. No model loading or TTS inference occurs for previews, including first use. Speed uses pitch-preserving playbackRate. Samples are precached with the offline app and are separate from the generated speech cache. Heart remains the default for new users; saved preferences remain editable. Development-only sample builder: tools/build-voice-samples.mjs. GitHub publication has not been updated for this change.
Saved voice and speed are always shown. Save is disabled until either selection changes; saving/reverting/canceling disables it again. Tested all five prerecorded samples, speed changes, reloads, cache count independence, saved preference persistence and cancel in the browser.

Streak page refreshed: readable current streak, longest/total study days, weekly progress, month calendar with navigation, completed-today status and quiz action. Current streak is no longer capped at seven days. streak-tests.mjs covers long streaks, grace period, gaps, invalid/future dates, duplicates and leap days. Browser checks: 320/390px, light/dark, 12-day fixture, month navigation and quiz controls. Existing study data was preserved; GitHub remains unchanged.

UI, voice and image update (2026-10-06):
Question library: Select multiple puts a checkbox before the type pill, highlights selected cards, lets you tap anywhere on a card to toggle it, and shows a sticky bar with Select all/Clear, Export, Delete (with confirmation) and exit. Escape closes menus, sheets and confirmations; card menus close on outside click and navigation.
Reports: the six report sections use an icon segmented control (3x2 on phones, one row on wider screens). The Activity calendar starts on Monday with one weekday header, day numbers, today highlighted and future days dimmed.
Settings: grouped Appearance/Voice/Quiz/Data/App sections with a sticky section bar, a Light/Dark segmented control, a styled restore-file button and consistent cards.
Speech engines: Kokoro AI voice (default) or Device voice (Web Speech API, instant, no download; voice and speed are chosen in Settings). Choosing Device voice never loads Kokoro and skips audio preparation on save. The engine choice is included in backups.
Kokoro speed-up: generation requests are now prioritised. A speaker tap always runs before background work, and tapping a clip that is already queued promotes it. Starting a quiz warms the model during the countdown, and the current and next question/answer are prepared in the background ("Prepare voice ahead during quizzes", on by default). Moving on cancels stale background work. Warm-up and prefetch only start after Kokoro has been used once, so new users never download the model unexpectedly. Saved clips replay in about 20-30 ms.
Images: question/front image and answer/back image can be added inline in step 1 (or pasted into the prompt); Multiple choice and Multi-select rows have a picture button per choice. Thumbnails open a full-screen preview, and a Live preview can be toggled from any step. Images are resized in the browser (max 1280px, WebP/JPEG) so large photos fit localStorage; inputs up to 25 MB are accepted. Answer images appear on the flashcard back, after checking an answer, and under View answer in the library.
Stylesheet order: base.css, CSS modules, voice.css, then polish.css (last-loaded overrides).
Tests: audio-tests.mjs adds priority, promotion, stale-prefetch cancellation and engine gating checks.
Multi-type questions, Import & export page and Settings refresh (2026-10-06):
Multi-type questions: one question can be asked up to six ways (main type plus up to 5 extra types, e.g. Multiple choice and Matching). In the editor use "Ways to ask this question" > Add type; each type has its own tab, prompt, answers, choices, pairs, steps or blanks, with Make type 1 and Remove. Subject, topic, tags and images are shared. Choose "Random each quiz" or "Always type 1". In a quiz the type is picked at random, limited to the types allowed by the quiz builder's type filter. Progress is tracked once per question. Stored as item.variants[] and item.typeMode (src/question-variants.js); older backups still load.
Import & export (#/transfer, opened from the Questions tools or the selection bar): Export all, one subject, chosen types or the selected questions as a RecallFlow file (JSON, keeps everything, optional images/progress), CSV, Anki/Quizlet TSV or a printable text sheet; then copy or download. Import a file, a dropped file or pasted text (JSON, CSV, TSV or "question | answer" lines; format auto-detected). The preview shows new, duplicate and invalid rows with checkboxes, subject/topic overrides, extra tags and a duplicate policy. A CSV template download is included (src/transfer-formats.js).
Images by link: every image slot has Upload and Link. Links are downloaded and resized when the site allows it; otherwise the https link is kept and shown when online.
Settings: Profile (name used in greetings), Appearance (Light/Dark/System, text size, reduce motion), Voice (plus "Read questions aloud automatically"), Quiz defaults (questions per quiz, shuffle questions, shuffle answer choices, 3-2-1 countdown, continue automatically, confirm before leaving a quiz), Data (storage meter, Import & export link, full backup/restore, Reset progress, Delete everything), App (offline, about). Sticky sidebar on wide screens. Stored in recallflow_app_preferences_v1 and included in backups.
Clutter removed: technical voice/audio detail text, footnotes and duplicate card labels.
Full UI check (390-412px phone, 1280px desktop, light/dark, default and Larger text): every page, all 11 editor types, every report tab and a quiz over all 11 types with and without images showed no overlap or horizontal overflow. Fixes from the check: compact quiz feedback (answer image capped, speaker beside the answer; the old voice.css rules used unprefixed module class names and never applied), flashcards grow to fit long prompts and answer images, a compact editor action bar, image-slot buttons wrap at large text, link errors clear on retry, the image-choice radio sits inside the picture, disabled ordering arrows are dimmed, a two-column type filter in the quiz builder, a score-based finish heading, and a duplicate topic label in the library.
Tests: variant-tests.mjs covers multi-type validation, variant selection and filters, editor round-trip, seeded shuffle, image links and CSV/JSON/TSV/text import-export. All 8 test files pass.
Bulk actions (2026-10-06): in Select multiple the bar offers Practice (quiz only the selected questions), Move (set subject and/or topic), Tag (add tags, existing tags kept), Export and Delete (with confirmation). While selecting, card Edit and View answer are hidden so a tap always toggles selection. Escape closes an open Move/Tag form.
Image editor (2026-10-06): every image in the question editor can be edited. Question/answer images have an Edit button; tapping a choice image opens Preview / Edit image / Replace image. The editor (src/react/ImageEditor.tsx) offers a draggable crop box with corner handles and a rule-of-thirds grid, crop shapes Free/Square/4:3/3:4/16:9, rotate left/right, mirror, flip, reset, and arrow-key nudging. Done saves a resized WebP/JPEG within the same storage limits as uploads; Escape or X cancels. Linked images from sites that block copying cannot be edited and show a message suggesting upload.
Logo (2026-10-06): one shared Brand component (src/react/BrandIcon.tsx) shows the book icon with 'Recall' in the text colour and 'Flow' in the theme blue on every screen. The icon and the word are a single button that goes home; on unsaved edits it asks to discard, and mid-quiz it shows 'Leave this quiz?' first.
Sticky header (2026-10-06): the top bar (logo, question count, theme button, profile) stays pinned while scrolling on Home, Questions, Report, Settings and Streak, with a thin divider once scrolled. The multi-select bar and the Settings shortcut bar sit just below it (--app-bar-h in polish.css).
Item pictures (2026-10-06): matching sides, ordering steps and word-bank words can each have a picture, like answer choices. Word-bank and ordering rows have an image button in step 1; matching pairs get pictures in step 2 (Images > Pair images, or the 'Add pictures' button under the pairs). All use optionImages keyed by the item text; a picture follows its text when renamed and is dropped when the text is removed. In the quiz the pictures appear on the matching cards, step rows and word-bank tiles.
Question bank redesign (2026-10-06): header with question/subject counts and New; four tap-to-filter tiles (Due today, Got wrong, With pictures, Multi-type); pill search with clear; Filters button with an active-filter badge (adds "Asked in several ways"); subject chips; results row with Clear and a sort menu. Cards show a type icon and colour, "+N ways" for multi-type questions with the list of extra types, a New/Due/In Nd badge, subject > topic, tags, accuracy, a zoomable thumbnail, Show answer, Edit and a menu (Edit, Practice now, Delete). Styles in src/react/bank.css (appended after polish.css by build.mjs).
Zoom (2026-10-06): question, answer, choice, matching, ordering and word-bank pictures have a zoom button; the viewer (src/react/ImageViewer.tsx) supports pinch, wheel, double-tap, +/-/0 keys, drag to pan and Escape.
Picture fit: fixed picture frames (choices, items, editor thumbnails) fill the frame (object-fit: cover) instead of showing empty bands; the main question picture keeps its own shape; zoom always shows the whole picture.
Picture-only (2026-10-06): a question can be just a picture (prompt optional when a question image exists, except blank types); a flashcard back can be just a picture. Adding a picture to an empty choice, word, step or matching side names it "Picture N" (matching right side "Picture A"); the quiz hides that name and shows only the picture (screen readers still hear it).
Quiz layouts (2026-10-06): sentence questions (fill blank, cloze, word bank) sit in a panel with dashed gaps that turn solid when filled; word-bank words show as used, tapping a filled active gap empties it, and wrong gaps show the given word struck through next to the right one. Ordering rows have a number badge, left-aligned text and per-step correct/wrong colours after checking. True/False shows two large tiles.
Voice tools (Settings > Voice, Kokoro): "Voices for existing questions" counts ready/missing clips for every question, answer and extra way of asking (with the saved voice and speed) and generates the missing ones with progress and Stop. "Check Kokoro" lists worker/WebGPU/storage support, loads the model, generates a test sentence without saving it and reports the engine and timings (kokoroVoice.check in src/kokoro-service.js, UI in src/react/VoiceLibrary.tsx).


LOGIN & CLOUD SYNC (Oct 2026)
-----------------------------
- The site opens with a login page (username Kaizen). The password is never stored in the code:
  it unlocks public/sync-vault.json (AES-GCM, PBKDF2-SHA256 600k), which holds a GitHub key that can
  only read/write the private repo rubie-max/RecallFlow-data.
- Data lives in RecallFlow-data: data/state.json (questions, reports, streak, quiz count, settings)
  and images/<hash>.<ext> (uploaded pictures). Each device keeps a full offline copy and syncs
  automatically (a few seconds after a change, when the app is reopened, and every minute).
- Edits on different devices are merged per question; deletions and "Reset progress" / "Delete everything"
  apply to all devices.
- Pictures are stored as files, so they no longer fill the browser's 5 MB storage. They are cached per device.
- Settings > Account shows sync status, Sync now and Log out.
- To change the password or replace the GitHub key: copy a new fine-grained token (Contents read/write on
  RecallFlow-data only), then run  node tools/make-vault.mjs rubie-max RecallFlow-data Kaizen
  and type the new password; publish the updated public/sync-vault.json.
- Default voice is now the phone's built-in voice; Kokoro can be chosen in Settings > Voice.
