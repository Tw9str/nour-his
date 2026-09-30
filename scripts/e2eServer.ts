import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fixture } from '../tests/fixture';
async function main() {
  const f = await fixture();
  await mkdir('.local', { recursive: true });
  await writeFile(
    '.local/e2eSchema.json',
    JSON.stringify({ schema: new URL(f.url).searchParams.get('schema') }),
  );
  await f.db.department.createMany({ data: [{ name: 'الداخلية' }, { name: 'الجراحة' }] });
  await f.db.ward.createMany({
    data: [
      { departmentName: 'الداخلية', name: 'الجناح أ' },
      { departmentName: 'الجراحة', name: 'الجناح ب' },
    ],
  });
  await f.db.bed.createMany({
    data: [
      { department: 'الداخلية', ward: 'الجناح أ', name: '101' },
      { department: 'الجراحة', ward: 'الجناح ب', name: '201' },
    ],
  });
  await f.db.service.create({ data: { name: 'معاينة طبية', price: 500000n } });
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3101'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: f.url,
        NOUR_BUILD_DIR: '.next-e2e',
        NOUR_ORIGIN: 'http://127.0.0.1:3101',
        NOUR_TRUST_PROXY: 'false',
        NOUR_TEST_LOGIN: 'true',
      },
    },
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    child.kill();
    await f.close();
    process.exit();
  };
  process.on('SIGTERM', () => void close());
  process.on('SIGINT', () => void close());
  child.on('exit', () => void close());
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
