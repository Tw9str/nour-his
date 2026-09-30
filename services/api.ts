import { schemas, fieldErrors, type Action, type Fields } from '@/shared/validation';
export class FeedbackError extends Error {
  constructor(
    message: string,
    public fields: Fields = {},
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}
const pending = new Map<string, { body: string; key: string }>();
export function clearPending() {
  pending.clear();
}
export async function submit(action: Action, input: unknown) {
  const valid = schemas[action].safeParse(input);
  if (!valid.success)
    throw new FeedbackError('راجع الحقول الموضحة أدناه', fieldErrors(valid.error));
  const body = JSON.stringify({ action, input: valid.data });
  let entry = pending.get(action);
  if (!entry || entry.body !== body) {
    entry = { body, key: `${Date.now()}_${crypto.randomUUID()}` };
    pending.set(action, entry);
  }
  let response: Response;
  try {
    response = await fetch('/api/app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': entry.key },
      body,
      cache: 'no-store',
    });
  } catch {
    throw new FeedbackError(
      'لم نتأكد من الحفظ. تحقق من الاتصال ثم أعد المحاولة بنفس البيانات',
      {},
      0,
    );
  }
  const result = await response
    .json()
    .catch(() => ({ error: 'تعذر قراءة رد الخادم. تحقق من السجل قبل المحاولة' }));
  if (response.ok || (response.status < 500 && ![408, 429].includes(response.status)))
    pending.delete(action);
  if (!response.ok) {
    if (response.status === 401 && action !== 'login' && action !== 'testLogin')
      window.dispatchEvent(new Event('nour-session-expired'));
    throw new FeedbackError(
      result.error || 'تعذر إكمال العملية',
      result.fields || {},
      response.status,
      result.code,
    );
  }
  return result as {
    entity?: string;
    paymentId?: string;
    signedOut?: boolean;
    discharged?: boolean;
  };
}
export async function read<T>(params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/app?' + params, { cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok)
    throw new FeedbackError(data.error || 'تعذر تحميل البيانات', {}, response.status);
  if (data.actor === null) {
    window.dispatchEvent(new Event('nour-session-expired'));
    throw new FeedbackError('سجّل الدخول مجددًا', {}, 401);
  }
  return data;
}
