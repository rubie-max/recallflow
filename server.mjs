import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {buildApp} from './build.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const clients = new Set();
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.wasm':'application/wasm'};
async function driveThumbBlob(id){
 const urls=[`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`,`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`,`https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`];
 for(const u of urls){
  const res=await fetch(u,{redirect:'follow'}).catch(()=>null);
  if(!res?.ok)continue;
  const blob=await res.blob();
  if(blob.type.startsWith('image/')||blob.size>1000)return {blob,type:blob.type.startsWith('image/')?blob.type:(res.headers.get('Content-Type')||'image/jpeg')};
 }
 return null;
}
const server = http.createServer(async(req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__reload') {res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': ready\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
  const drive=pathname.match(/^\/rf-drive-thumb\/([^/?#]+)$/);
  if(drive&&req.method==='GET'){
   const got=await driveThumbBlob(decodeURIComponent(drive[1]));
   if(!got){res.writeHead(502);res.end('Drive image unavailable');return;}
   const buf=Buffer.from(await got.blob.arrayBuffer());
   res.writeHead(200,{'Content-Type':got.type,'Cache-Control':'no-cache'});res.end(buf);return;
  }
  try {
    const base = pathname.startsWith('/vendor/') ? path.join(root,'public') : root;
    const relative = decodeURIComponent(pathname==='/'?'/index.html':pathname.endsWith('/')?pathname+'index.html':pathname);
    const file = path.resolve(base,'.'+relative);
    if (!file.startsWith(base+path.sep)) {res.writeHead(403);res.end();return;}
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
    let content=await readFile(file);
    if(pathname==='/' || pathname==='/index.html') content=Buffer.from(content.toString().replace('</body>',`<script>new EventSource('/__reload').onmessage=()=>location.reload();</script></body>`));
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(content);
  } catch {res.writeHead(404);res.end('Not found');}
});
let timer,building=false,queued=false;
async function rebuild(){if(building){queued=true;return}building=true;try{await buildApp();for(const c of clients)c.write('data: reload\n\n');}catch(error){console.error('Build failed:',error.message)}finally{building=false;if(queued){queued=false;rebuild();}}}
watch(path.join(root,'src'),{recursive:true},()=>{clearTimeout(timer);timer=setTimeout(rebuild,150);});
server.listen(5173,'127.0.0.1',()=>console.log('RecallFlow live preview: http://127.0.0.1:5173'));
