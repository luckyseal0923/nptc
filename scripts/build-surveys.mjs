import { readFile, writeFile } from 'node:fs/promises';
import './build-survey-catalog.mjs';
const definition = JSON.parse(await readFile('lib/dti-sk.json', 'utf8'));
const quote = value => `'${value.replaceAll("'", "''")}'`;
const seed = `insert into nptc_private.survey_instruments(code,version,definition) values(${quote(definition.code)},${quote(definition.version)},${quote(JSON.stringify(definition))}::jsonb) on conflict(code,version) do nothing;`;
const path = 'supabase/upgrade-surveys.sql';
const sql = (await readFile(path, 'utf8')).replace(/-- BEGIN DTI-SK DEFINITION[\s\S]*?-- END DTI-SK DEFINITION/, () => `-- BEGIN DTI-SK DEFINITION\n${seed}\n-- END DTI-SK DEFINITION`);
await writeFile(path, sql);
export const surveyUpgrade = sql;
