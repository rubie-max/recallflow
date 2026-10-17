import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {buildApp} from './build.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const clients = new Set();
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.wasm':'application/wasm'};
const server = http.createServer(async(req,res)=>{
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname==='/__reload') {res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.write(': ready\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
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
