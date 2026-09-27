import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..',process.env.SITE_DIR||'.');
const prefix=(process.env.BASE_PATH||'').replace(/\/$/,'');
const port=Number(process.env.PORT||4173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
http.createServer((req,res)=>{
  try {
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    let url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(prefix && url===prefix){res.writeHead(302,{Location:prefix+'/'}).end();return;}
    if(prefix && !url.startsWith(prefix+'/')){res.writeHead(404).end();return;}
    url=url.slice(prefix.length);if(url.endsWith('/'))url+='index.html';
    const file=path.resolve(root,'.'+url);
    if(!file.startsWith(root+path.sep)||url.split('/').some(p=>p.startsWith('.')&&p!=='.nojekyll')){res.writeHead(403).end();return;}
    fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);});
  }catch{res.writeHead(400).end('Bad request');}
}).listen(port,'127.0.0.1',()=>console.log(`Poker Lab http://127.0.0.1:${port}${prefix}/`));
