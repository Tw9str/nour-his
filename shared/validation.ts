import { z } from 'zod';
export const western = (v: string) =>
  v.replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) - (c >= '۰' ? 1776 : 1632)));
const text = (min = 1, max = 120) =>
  z
    .string({ error: 'أدخل قيمة صحيحة' })
    .trim()
    .min(min, { error: `أدخل ${min} حروف على الأقل` })
    .max(max, { error: `الحد الأقصى ${max} محرفًا` });
export const password = z
  .string()
  .max(200, { error: 'الحد الأقصى 200 محرف' })
  .transform((v) => v.normalize('NFC'))
  .refine((v) => [...v].length >= 12, {
    error: 'استخدم كلمة مرور من 12 محرفًا على الأقل',
  })
  .refine(
    (v) =>
      !['password1234', 'administrator', 'shamdemo2026!', '123456789012'].includes(
        v.toLowerCase(),
      ) && !/^(.{1,4})\1{2,}$/u.test(v),
    { error: 'اختر كلمة مرور يصعب تخمينها' },
  );
const id = z.uuid({ error: 'اختر سجلًا صالحًا' });
const version = z.int().positive();
const qty = z
  .int({ error: 'أدخل عددًا صحيحًا' })
  .min(1, { error: 'الكمية يجب أن تكون 1 على الأقل' })
  .max(100000);
export const money = z
  .string()
  .transform(western)
  .pipe(
    z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, {
      error: 'أدخل مبلغًا موجبًا مع منزلتين عشريتين كحد أقصى',
    }),
  );
export const minor = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const reason = text(5, 300);
export const loginSchema = z.strictObject({
  username: text(3, 80).toLowerCase(),
  password: z.string().min(1, { error: 'أدخل كلمة المرور' }).max(200),
  role: z
    .enum(['admin', 'nurse', 'billing', 'inventory'], { error: 'اختر دور الحساب' })
    .optional(),
});
export const schemas = {
  login: loginSchema,
  testLogin: z.strictObject({ role: z.enum(['admin', 'nurse', 'billing', 'inventory']) }),
  logout: z.strictObject({}),
  activity: z.strictObject({}),
  password: z
    .strictObject({
      currentPassword: z.string().min(1),
      newPassword: password,
      confirmation: z.string(),
    })
    .refine((v) => v.newPassword === v.confirmation.normalize('NFC'), {
      path: ['confirmation'],
      error: 'كلمتا المرور غير متطابقتين',
    }),
  admit: z.strictObject({
    name: text(1, 100).regex(/^[\p{L}][\p{L}\p{M} '\u2019\-]*$/u, {
      error: 'أدخل اسمًا نصيًا دون أرقام أو رموز',
    }),
    phone: z
      .string()
      .trim()
      .transform(western)
      .pipe(
        z.string().regex(/^(?:\+?\d{7,15})?$/, {
          error: 'أدخل رقم هاتف صحيحًا من 7 إلى 15 رقمًا',
        }),
      )
      .default(''),
    dob: z.iso
      .date({ error: 'أدخل تاريخ ميلاد صحيحًا' })
      .refine((v) => v <= new Date().toISOString().slice(0, 10), {
        error: 'تاريخ الميلاد لا يمكن أن يكون في المستقبل',
      }),
    sex: z.enum(['female', 'male', ''], { error: 'اختر الجنس' }).default(''),
    bedId: id,
    duplicateReason: z.string().trim().max(300).default(''),
  }),
  transfer: z.strictObject({ stayId: id, version, bedId: id, reason }),
  addCharge: z.strictObject({
    stayId: id,
    version,
    kind: z.enum(['service', 'item']),
    sourceId: id,
    quantity: qty,
  }),
  voidCharge: z.strictObject({ stayId: id, version, chargeId: id, reason }),
  checkout: z.strictObject({
    stayId: id,
    version,
    amount: money,
    method: z.enum(['cash', 'card', 'transfer']),
    discharge: z.boolean(),
  }),
  item: z.strictObject({
    id: id.optional(),
    version: version.optional(),
    sku: text(2, 30),
    name: text(2, 100),
    unit: text(1, 30),
    price: money,
    minimum: z.int().min(0).max(100000),
  }),
  stock: z.strictObject({
    itemId: id,
    version,
    quantity: z
      .int()
      .min(-100000)
      .max(100000)
      .refine((v) => v !== 0, { error: 'أدخل كمية أكبر من 0' }),
    reason,
  }),
  archiveItem: z.strictObject({ itemId: id, version, reason }),
  expense: z.strictObject({
    title: text(3, 120),
    category: z.enum(['supplies', 'salary', 'maintenance', 'utilities', 'other']),
    amount: money.refine((v) => minor(v) > 0n, {
      error: 'المبلغ يجب أن يكون أكبر من 0',
    }),
    date: z.iso.date({ error: 'أدخل تاريخًا صحيحًا' }),
    note: z.string().trim().max(300).default(''),
  }),
  voidExpense: z.strictObject({ expenseId: id, reason }),
  bed: z.strictObject({
    id: id.optional(),
    version: version.optional(),
    department: text(2, 60),
    ward: text(1, 60),
    name: text(1, 30),
  }),
  department: z.strictObject({
    id: id.optional(),
    version: version.optional(),
    name: text(2, 60),
  }),
  ward: z.strictObject({
    id: id.optional(),
    version: version.optional(),
    departmentName: text(2, 60),
    name: text(1, 60),
  }),
  service: z.strictObject({
    id: id.optional(),
    version: version.optional(),
    name: text(2, 100),
    price: money,
  }),
  user: z.strictObject({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9._-]{2,39}$/, {
        error: 'استخدم 3 إلى 40 حرفًا لاتينيًا أو رقمًا دون مسافات',
      }),
    name: text(3, 100),
    email: z.union([
      z.email({ error: 'أدخل بريدًا إلكترونيًا صحيحًا' }).max(150),
      z.literal(''),
    ]),
    role: z.enum(['admin', 'nurse', 'billing', 'inventory']),
    password,
  }),
  updateUser: z.strictObject({
    userId: id,
    version,
    name: text(3, 100),
    email: z.union([
      z.email({ error: 'أدخل بريدًا إلكترونيًا صحيحًا' }).max(150),
      z.literal(''),
    ]),
    role: z.enum(['admin', 'nurse', 'billing', 'inventory']),
  }),
  disableUser: z.strictObject({
    userId: id,
    currentPassword: z.string().min(1),
    reason,
  }),
  deleteDepartment: z.strictObject({ id, version }),
  deleteWard: z.strictObject({ id, version }),
  deleteBed: z.strictObject({ id, version }),
  deleteService: z.strictObject({ id, version }),
  deleteUser: z.strictObject({
    id,
    version,
    currentPassword: z.string().max(200).default(''),
  }),
};
export type Action = keyof typeof schemas;
export type ActionInput<K extends Action> = z.output<(typeof schemas)[K]>;
export type Fields = Record<string, string>;
export function fieldErrors(error: z.ZodError): Fields {
  return Object.fromEntries(
    error.issues
      .slice(0, 20)
      .map((i) => [
        i.path.join('.'),
        /[؀-ۿ]/.test(i.message) ? i.message : 'تحقق من القيمة المدخلة',
      ]),
  );
}
