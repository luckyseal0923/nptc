import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const staged = process.argv.includes('--staged');
const names = execFileSync('git', staged ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'] : ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const failures = [];
for (const name of names) {
  if (/(^|\/)meta\.docx$/i.test(name) || /(^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith('.env.example')) { failures.push(name); continue; }
  if (!/\.(?:[cm]?[jt]sx?|sql|json|ya?ml|toml|md|html|txt|example)$/.test(name)) continue;
  let source;
  try { source = staged ? execFileSync('git', ['show', `:${name}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }) : readFileSync(name, 'utf8'); }
  catch { failures.push(`${name}（讀取失敗，尚未完成掃描）`); continue; }
  let sensitive = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source);
  for (const token of source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? []) {
    try { if (JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).role === 'service_role') sensitive = true; } catch { /* not a JWT */ }
  }
  if (sensitive) failures.push(name);
}
if (failures.length) { console.error(`拒絕包含機密的檔案：${failures.join('、')}。未輸出機密內容。`); process.exitCode = 1; }
else console.log(`PASS: ${staged ? '暫存提交' : '追蹤檔案'}機密掃描（${names.length} 檔）。`);
