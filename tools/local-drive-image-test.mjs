import assert from 'node:assert/strict';
import {driveFileId,resolveImageLink,driveImageEditUrl} from '../src/question-types.js';

const DRIVE_VIEW='https://drive.google.com/file/d/196xr6Bm0P1tsP9iwQxiP9LFmbWuOlmE-/view?usp=drivesdk';
const id='196xr6Bm0P1tsP9iwQxiP9LFmbWuOlmE-';
const base=process.env.RF_LOCAL||'http://127.0.0.1:5173';

assert.equal(driveFileId(DRIVE_VIEW),id);
assert.match(resolveImageLink(DRIVE_VIEW),new RegExp(`thumbnail\\?id=${id.replace(/[-]/g,'\\$&')}`));
// Drive edit now goes through a CORS-enabling proxy so the canvas stays untainted and exportable.
const edit=driveImageEditUrl(DRIVE_VIEW);
assert.match(edit,/^https:\/\/images\.weserv\.nl\/\?url=/,`unexpected edit URL: ${edit}`);
assert.ok(decodeURIComponent(edit).includes(`drive.google.com/thumbnail?id=${id}`),'edit URL missing Drive thumbnail source');

const res=await fetch(edit);
assert.equal(res.status,200,`GET ${edit} -> ${res.status}`);
const type=res.headers.get('content-type')||'';
assert.match(type,/image\//,`expected image, got ${type}`);
const acao=res.headers.get('access-control-allow-origin')||'';
assert.ok(acao==='*'||acao.length>0,`proxy must send CORS header, got "${acao}"`);
const buf=Buffer.from(await res.arrayBuffer());
assert.ok(buf.length>10_000,`image too small (${buf.length} bytes)`);

const bundle=await fetch(`${base}/assets/app.js`).then(r=>r.text());
assert.ok(bundle.includes('driveImageEditUrl'),'built bundle missing driveImageEditUrl');
assert.ok(bundle.includes('images.weserv.nl'),'built bundle missing CORS image proxy');

console.log(`PASS: Drive link + CORS edit proxy (${buf.length} bytes image, ACAO="${acao}")`);
