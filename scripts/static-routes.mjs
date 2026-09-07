import {mkdir,copyFile,writeFile} from 'node:fs/promises';
for(const route of ['student','teacher']){await mkdir(`dist/${route}`,{recursive:true});await copyFile('dist/index.html',`dist/${route}/index.html`);}
await copyFile('dist/index.html','dist/404.html');
await writeFile('dist/.nojekyll','');
await writeFile('dist/_headers','/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
