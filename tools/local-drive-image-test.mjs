import assert from 'node:assert/strict';
import {driveFileId,resolveImageLink,driveImageEditUrl} from '../src/question-types.js';

const DRIVE_VIEW='https://drive.google.com/file/d/196xr6Bm0P1tsP9iwQxiP9LFmbWuOlmE-/view?usp=drivesdk';
const id='196xr6Bm0P1tsP9iwQxiP9LFmbWuOlmE-';
const base=process.env.RF_LOCAL||'http://127.0.0.1:5173';

assert.equal(driveFileId(DRIVE_VIEW),id);
assert.match(resolveImageLink(DRIVE_VIEW),new RegExp(`thumbnail\\?id=${id.replace(/[-]/g,'\\$&')}`));
assert.match(driveImageEditUrl(DRIVE_VIEW),/rf-drive-thumb\//);

const proxy=`${base}/rf-drive-thumb/${encodeURIComponent(id)}`;
const res=await fetch(proxy);
assert.equal(res.status,200,`GET ${proxy} -> ${res.status}`);
const type=res.headers.get('content-type')||'';
assert.match(type,/image\//,`expected image, got ${type}`);
const buf=Buffer.from(await res.arrayBuffer());
assert.ok(buf.length>10_000,`image too small (${buf.length} bytes)`);

const bundle=await fetch(`${base}/assets/app.js`).then(r=>r.text());
assert.ok(bundle.includes('driveImageEditUrl'),'built bundle missing driveImageEditUrl');
assert.ok(bundle.includes('ensureDriveEditReady'),'built bundle missing ensureDriveEditReady');

console.log(`PASS: local Drive link + edit proxy (${buf.length} bytes JPEG via ${base})`);
