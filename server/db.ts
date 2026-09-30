import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const globalDb = globalThis as unknown as { nourDb?: PrismaClient };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!globalDb.nourDb) {
    const schema = new URL(process.env.DATABASE_URL).searchParams.get('schema') || 'public';
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Invalid schema');
    globalDb.nourDb = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: process.env.DATABASE_URL,
          max: 10,
          connectionTimeoutMillis: 5000,
          options: `-c search_path=${schema}`,
        },
        { schema },
      ),
    });
  }
  return globalDb.nourDb;
}
export type Tx = Prisma.TransactionClient;
export async function transaction<T>(work: (tx: Tx) => Promise<T>) {
  return database().$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout='5s'`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(68423190)`;
      return work(tx);
    },
    { timeout: 15000, maxWait: 7000 },
  );
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}
export async function disconnect() {
  await globalDb.nourDb?.$disconnect();
  globalDb.nourDb = undefined;
}
export async function audit(tx: Tx, actorId: string, action: string, entity: string, detail = '') {
  await tx.audit.create({ data: { actorId, action, entity, detail } });
}
export const jsonSafe = (value: unknown) =>
  JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
