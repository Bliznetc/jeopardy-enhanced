import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Lightweight, dependency-free .env loader. Looks for .env in the current
// working directory and the parent (repo root), and only sets keys that are
// not already present in the environment. Missing files are simply ignored,
// so dev/test keep working with zero config.
const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env')];
const file = candidates.find((p) => existsSync(p));

if (file) {
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
