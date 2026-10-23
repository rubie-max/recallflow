import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','public');
const port=Number(process.argv[2]||5192);
http.createServer((req,res)=>{
  const f=path.join(root,req.url==='/'?'link-popup-mockups.html':req.url.replace(/^\//,''));
  fs.readFile(f,(err,data)=>{
    if(err){res.writeHead(404);res.end('not found');return;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(data);
  });
}).listen(port,()=>console.log(`http://127.0.0.1:${port}/link-popup-mockups.html`));
