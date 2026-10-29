import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
// Zeabur reads the repository-root policy; the artifact keeps the same policy.
// GitHub Pages ignores _headers, so supported CSP and referrer rules also use HTML meta.
const headers=await readFile(new URL('../_headers',import.meta.url),'utf8');
const policy=headers.match(/Content-Security-Policy: (.+)/)?.[1];
if(!policy)throw new Error('Missing Content-Security-Policy');
const metaPolicy=policy.replace(/frame-ancestors [^;]+;?\s*/,'').replaceAll('"','&quot;');
const index=(await readFile('dist/index.html','utf8')).replace('</head>',`<meta http-equiv="Content-Security-Policy" content="${metaPolicy}"/><meta name="referrer" content="strict-origin-when-cross-origin"/></head>`);
await writeFile('dist/index.html',index);
for(const route of ['student','teacher']){await mkdir(`dist/${route}`,{recursive:true});await copyFile('dist/index.html',`dist/${route}/index.html`);}
await mkdir('dist/q',{recursive:true});
const surveyTitle='問卷填寫｜為國考而訓 NPTC';
const surveyDescription='請使用學員帳號與密碼登入，完成老師發布的問卷。';
const surveyHtml=(await readFile('dist/index.html','utf8'))
 .replace(/<title>[\s\S]*?<\/title>/,`<title>${surveyTitle}</title>`)
 .replace(/<meta name="description" content="[^"]*"\s*\/?>/,`<meta name="description" content="${surveyDescription}"/>`)
 .replace('</head>',`<meta property="og:type" content="website"/><meta property="og:title" content="${surveyTitle}"/><meta property="og:description" content="${surveyDescription}"/><meta name="robots" content="noindex,nofollow"/></head>`);
await writeFile('dist/q/index.html',surveyHtml);
await copyFile('dist/index.html','dist/404.html');
await writeFile('dist/.nojekyll','');
await writeFile('dist/_headers',headers);
