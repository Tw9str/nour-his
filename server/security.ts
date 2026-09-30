import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { AppError, database } from './db';
export const digest = (v: string) => createHash('sha256').update(v).digest('hex');
export const cookieName = 'nour_session';
export function origin(request: Request) {
  const value = process.env.NOUR_ORIGIN || new URL(request.url).origin;
  const url = new URL(value);
  if (url.origin !== value || !['http:', 'https:'].includes(url.protocol))
    throw new AppError('إعداد عنوان الخادم غير صحيح', 503);
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.NOUR_ORIGIN || url.protocol !== 'https:')
  )
    throw new AppError('يلزم إعداد HTTPS قبل التشغيل', 503);
  if (!process.env.NOUR_ORIGIN && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new AppError('يلزم إعداد عنوان الشبكة المحلية', 503);
  return value;
}
export function guard(request: Request) {
  const expected = origin(request),
    supplied = request.headers.get('origin');
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (supplied && supplied !== expected) ||
    (request.headers.has('host') && request.headers.get('host') !== new URL(expected).host) ||
    (!['GET', 'HEAD'].includes(request.method) && supplied !== expected)
  )
    throw new AppError('مصدر الطلب غير مسموح', 403);
}
export function source(request: Request) {
  if (process.env.NOUR_TRUST_PROXY !== 'true') {
    if (process.env.NODE_ENV === 'production') throw new AppError('يلزم إعداد الوكيل الموثوق', 503);
    return 'development';
  }
  const ip = request.headers.get('x-real-ip') || '';
  if (!isIP(ip)) throw new AppError('تعذر التحقق من مصدر الاتصال', 403);
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
}
export async function rate(identity: string, max: number, seconds: number) {
  const id = digest(identity),
    until = new Date(Date.now() + seconds * 1000);
  const rows = await database().$queryRaw<
    { count: number; expiresAt: Date }[]
  >`INSERT INTO "RateBucket" ("id","count","expiresAt") VALUES (${id},1,${until}) ON CONFLICT ("id") DO UPDATE SET "count"=CASE WHEN "RateBucket"."expiresAt"<NOW() THEN 1 ELSE "RateBucket"."count"+1 END, "expiresAt"=CASE WHEN "RateBucket"."expiresAt"<NOW() THEN ${until} ELSE "RateBucket"."expiresAt" END RETURNING "count","expiresAt"`;
  if (rows[0].count > max)
    throw new AppError(
      `طلبات كثيرة. حاول بعد ${Math.max(1, Math.ceil((rows[0].expiresAt.getTime() - Date.now()) / 1000))} ثانية`,
      429,
    );
}
let active = 0;
export function enter() {
  if (active >= 12) throw new AppError('الخادم مشغول. حاول بعد قليل', 503);
  active++;
  let done = false;
  return () => {
    if (!done) {
      active--;
      done = true;
    }
  };
}
export function sessionToken(request: Request) {
  const parts = (request.headers.get('cookie') || '')
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p.startsWith(cookieName + '='));
  if (parts.length !== 1) return;
  const token = parts[0].slice(cookieName.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}
export async function readBody(request: Request) {
  if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') || ''))
    throw new AppError('صيغة الطلب غير مدعومة', 415);
  if (
    request.headers.has('content-encoding') &&
    request.headers.get('content-encoding') !== 'identity'
  )
    throw new AppError('الضغط غير مدعوم', 415);
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 16384))
    throw new AppError('حجم الطلب أكبر من المسموح', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('الطلب فارغ');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        let size = 0;
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16384) throw new AppError('حجم الطلب أكبر من المسموح', 413);
          chunks.push(value);
        }
        try {
          return JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
          );
        } catch {
          throw new AppError('تعذر قراءة الطلب');
        }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AppError('انتهت مهلة الطلب', 408)), 7000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}
export function receipt(request: Request, token: string, input: unknown) {
  const key = request.headers.get('idempotency-key') || '';
  const match =
    /^(\d{13})_([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.exec(key);
  if (!match || Date.now() - Number(match[1]) > 86400000 || Number(match[1]) - Date.now() > 300000)
    throw new AppError('أعد فتح النموذج ثم حاول مجددًا');
  return {
    id: digest(token + key),
    hash: createHmac('sha256', token).update(JSON.stringify(input)).digest('hex'),
  };
}
