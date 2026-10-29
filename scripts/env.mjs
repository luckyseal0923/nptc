import { existsSync, readFileSync } from 'node:fs';
export function localEnv(file = '.env.local') {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : [];
  }));
}
export function publicEnv() {
  const env = { ...localEnv('.env'), ...localEnv(), ...process.env };
  return { url: env.NEXT_PUBLIC_SUPABASE_URL?.trim(), key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() };
}
