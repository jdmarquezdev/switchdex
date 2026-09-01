import { readFile } from 'node:fs/promises';

export async function loadLocalEnv(): Promise<void> {
  try {
    const source = await readFile('.env', 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
      process.env[match[1]] = value;
    }
  } catch {
    // A local .env is optional; deployment can inject variables directly.
  }
}
