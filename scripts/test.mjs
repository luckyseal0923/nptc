import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const tests = (await readdir('tests')).filter(file=>file.endsWith('.mjs') && !file.includes('fixture') && !file.startsWith('helpers')).sort();
for (const test of tests) {
  const result = spawnSync(process.execPath,['--test',`tests/${test}`],{stdio:'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
