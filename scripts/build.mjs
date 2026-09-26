import {cpSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');rmSync(dist,{recursive:true,force:true});mkdirSync(dist);
for(const file of ['index.html','hu.html','styles.css','practice.css','src'])cpSync(path.join(root,file),path.join(dist,file),{recursive:true});
writeFileSync(path.join(dist,'.nojekyll'),'');
writeFileSync(path.join(dist,'build.json'),JSON.stringify({version:'2.0.0',commit:process.env.GITHUB_SHA||'local',builtAt:new Date().toISOString()},null,2));
console.log('Built static site in dist/ (no tests, tooling or repository metadata)');
