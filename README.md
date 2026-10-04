# RecallFlow

A React revision app with quizzes, spaced repetition, question images, analytics, local backups, offline study, and browser-based Kokoro speech.

## Development

Use Node.js 22 or later.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173/.

```sh
npm test
npm run build
```

The `dist/` directory is the static website. All app asset URLs are relative so it can be hosted under a GitHub Pages repository path.

## GitHub Pages

Set Settings → Pages → Source to GitHub Actions. The included workflow tests and builds the app on pushes to `main`, then publishes only `dist/`.

## Study data

Questions, progress, reports, settings, and generated audio stay in browser storage. Localhost data is not transferred when the hosting address changes. Export a full backup in Settings and restore it on the hosted app. Study data is separate on each browser and device.

Kokoro runs in the browser with WebGPU or WASM. Voice model downloads require an internet connection on first use.

Authentication and cross-device sync are deferred. The hosted website is publicly accessible.
