import { spawn } from 'node:child_process';
import { join } from 'node:path';

export function postgresConnection(value: string) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('PostgreSQL URL required.');
  const schema = url.searchParams.get('schema') || 'public';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Invalid backup schema.');
  url.searchParams.delete('schema');
  return { url, schema };
}

export function postgresTool(name: 'pg_dump' | 'pg_restore', url: URL, args: string[]) {
  const binary = name + (process.platform === 'win32' ? '.exe' : '');
  const executable = process.env.NOUR_PG_BIN ? join(process.env.NOUR_PG_BIN, binary) : binary;
  const child = spawn(executable, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Credentials never enter the process argument list or console output.
    env: {
      ...process.env,
      PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGCONNECT_TIMEOUT: '10',
      ...Object.fromEntries(
        ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']
          .filter((key) => url.searchParams.has(key))
          .map((key) => ['PG' + key.toUpperCase(), url.searchParams.get(key)!]),
      ),
    },
  });
  const timeout = setTimeout(() => child.kill(), 3600000);
  timeout.unref();
  child.once('close', () => clearTimeout(timeout));
  child.once('error', () => clearTimeout(timeout));
  // Spawn can fail while the encryption stream is still opening its destination.
  child.stdout.on('error', () => undefined);
  let warned = false;
  child.stderr.on('data', () => {
    warned = true;
  });
  const completion = new Promise<void>((resolve, reject) => {
    child.once('error', () => {
      const error = new Error(
        `Cannot start ${name}. Install matching PostgreSQL client tools and configure NOUR_PG_BIN.`,
      );
      child.stdout.destroy(error);
      reject(error);
    });
    child.once('close', (code) =>
      code === 0 && !warned
        ? resolve()
        : reject(
            new Error(
              `${name} failed or reported warnings. Inspect the PostgreSQL service locally; archive not accepted.`,
            ),
          ),
    );
  });
  return { child, completion };
}
