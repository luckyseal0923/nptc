import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const sourceUrl = 'https://apiservice.mol.gov.tw/OdService/download/A17000000J-020028-jpp';
const target = resolve('public/data/accredited-hospitals.json');
const sourceFile = process.env.HOSPITAL_SOURCE_FILE;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toDirectory(rows) {
  const unique = new Map();
  for (const row of rows) {
    const name = text(row['醫院名稱']);
    if (!name) continue;
    const item = {
      name,
      city: text(row['所在縣市']),
      level: text(row['醫院評鑑評鑑結果']),
    };
    unique.set(`${item.city}|${item.name}`, item);
  }
  return [...unique.values()].sort((a, b) => a.city.localeCompare(b.city, 'zh-Hant') || a.name.localeCompare(b.name, 'zh-Hant'));
}

async function loadRows() {
  if (sourceFile) return JSON.parse(await readFile(sourceFile, 'utf8'));
  const response = await fetch(sourceUrl, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`官方資料下載失敗（HTTP ${response.status}）`);
  return response.json();
}

try {
  const rows = await loadRows();
  if (!Array.isArray(rows)) throw new Error('官方資料格式不符預期。');
  const hospitals = toDirectory(rows);
  if (!hospitals.length) throw new Error('官方資料未包含醫院。');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({ source: sourceUrl, updatedAt: new Date().toISOString(), hospitals }, null, 2)}\n`, 'utf8');
  console.log(`已更新 ${hospitals.length} 家評鑑合格醫院。`);
} catch (error) {
  if (existsSync(target)) {
    console.warn(`無法更新官方醫院名冊，保留現有快取：${error.message}`);
  } else {
    throw error;
  }
}
