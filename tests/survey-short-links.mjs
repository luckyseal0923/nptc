import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import jsQR from 'jsqr';
import { encodeSurveyId, decodeSurveyCode, shortSurveyPath, surveyIdFromShortQuery } from '../lib/survey-short-link.ts';
import { surveyQrDataUrl } from '../lib/survey-qr.ts';

const require = createRequire(import.meta.url);
const { PNG } = createRequire(require.resolve('qrcode'))('pngjs');
const id = '58a1716d-05b0-46fc-98fe-83cf10d86fe3';
const shortUrl = 'https://nptc-wfh.zeabur.app' + shortSurveyPath(id);

test('all UUID bits round-trip without a database and malformed codes cannot select another destination', () => {
  for (const value of [id, '00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff', ...Array.from({length:100}, () => randomUUID())]) {
    const code = encodeSurveyId(value.toUpperCase());
    assert.equal(code.length, 22);
    assert.equal(code, Buffer.from(value.replaceAll('-', ''), 'hex').toString('base64url'));
    assert.equal(decodeSurveyCode(code), value);
    assert.equal(surveyIdFromShortQuery(`?s=${code}`), value);
  }
  assert.ok(shortUrl.length < (`https://nptc-wfh.zeabur.app/student/?survey=${id}`).length);
  assert.equal(surveyIdFromShortQuery(`?s=${encodeSurveyId(id)}&s=${encodeSurveyId(randomUUID())}`), null);
  for (const bad of ['', 'abc', 'https://example.test', '../teacher', 'A'.repeat(21), 'A'.repeat(23), 'A'.repeat(21)+'B', '%'.repeat(22)]) assert.equal(decodeSurveyCode(bad), null);
  assert.throws(() => encodeSurveyId('not-a-publication'), /問卷編號/);
});

test('downloadable PNG independently decodes to the exact short link', async () => {
  const dataUrl = await surveyQrDataUrl(shortUrl);
  assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
  assert.equal(png.width, 1024); assert.equal(png.height, 1024);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(decoded?.data, shortUrl);
  await assert.rejects(() => surveyQrDataUrl('javascript:alert(1)'), /連結格式/);
  await assert.rejects(() => surveyQrDataUrl('http://example.test/q/'), /連結格式/);
});

test('static short-link landing page exposes questionnaire metadata before JavaScript runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nptc-short-links-'));
  try {
    await mkdir(join(dir, 'dist'));
    await writeFile(join(dir, 'dist/index.html'), '<html><head><title>課程首頁</title><meta name="description" content="課程介紹"/></head><body><script type="module" src="/nptc/assets/app.js"></script></body></html>');
    const result = spawnSync(process.execPath, [resolve('scripts/static-routes.mjs')], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const q = await readFile(join(dir, 'dist/q/index.html'), 'utf8');
    assert.ok(q.includes('<title>問卷填寫｜為國考而訓 NPTC</title>'));
    assert.ok(q.includes('property="og:title" content="問卷填寫｜為國考而訓 NPTC"'));
    assert.ok(q.includes('請使用學員帳號與密碼登入'));
    assert.ok(q.includes('src="/nptc/assets/app.js"'), 'keep subpath build asset URLs');
    assert.ok(q.includes('http-equiv="Content-Security-Policy"'));
    const metaPolicy=q.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
    assert.ok(metaPolicy.includes("script-src 'self'"));assert.ok(!metaPolicy.includes('frame-ancestors'),'frame-ancestors requires an HTTP header');
    const headers=await readFile(join(dir,'dist/_headers'),'utf8');assert.ok(headers.includes('X-Frame-Options: DENY'));assert.ok(headers.includes("frame-ancestors 'none'"));
    assert.ok(!(await readFile(join(dir, 'dist/student/index.html'), 'utf8')).includes('property="og:title"'));
  } finally {
    assert.ok(basename(dir).startsWith('nptc-short-links-'));
    await rm(dir, {recursive:true,force:true});
  }
});
