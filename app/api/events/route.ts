import { authenticated } from '@/server/auth';
import { database, AppError } from '@/server/db';
import { guard, rate, sessionToken, source } from '@/server/security';
const connections = new Map<string, number>();
let total = 0;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    guard(request);
    const token = sessionToken(request);
    await rate('events:' + source(request), 60, 60);
    const actor = await authenticated(token);
    if ((connections.get(actor.id) || 0) >= 4 || total >= 60)
      throw new AppError('اتصالات كثيرة', 429);
    connections.set(actor.id, (connections.get(actor.id) || 0) + 1);
    total++;
    let stop: () => void = () => {};
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        let last = -1;
        let timer: ReturnType<typeof setTimeout>;
        const started = Date.now();
        const encoder = new TextEncoder();
        stop = () => {
          if (closed) return;
          closed = true;
          clearTimeout(timer);
          request.signal.removeEventListener('abort', stop);
          total--;
          const count = (connections.get(actor.id) || 1) - 1;
          if (count) connections.set(actor.id, count);
          else connections.delete(actor.id);
          try {
            controller.close();
          } catch {}
        };
        request.signal.addEventListener('abort', stop, { once: true });
        const tick = async () => {
          if (closed) return;
          try {
            await authenticated(token);
            const revision =
              (await database().revision.findUnique({ where: { id: 1 } }))?.value ?? 0;
            if (closed) return;
            controller.enqueue(
              encoder.encode(revision !== last ? `data: ${revision}\n\n` : ': heartbeat\n\n'),
            );
            last = revision;
            if (Date.now() - started > 240000) {
              stop();
              return;
            }
          } catch {
            stop();
            return;
          }
          timer = setTimeout(tick, 1500);
        };
        if (request.signal.aborted) stop();
        else void tick();
      },
      cancel() {
        stop();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store, private',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return Response.json(
      { error: 'تعذر الاتصال المباشر' },
      {
        status: error instanceof AppError ? error.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
