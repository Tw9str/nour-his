export type Role = 'admin' | 'nurse' | 'billing' | 'inventory';
export type Actor = {
  id: string;
  name: string;
  username: string;
  role: Role;
  mustChange: boolean;
};
export type Bed = {
  id: string;
  department: string;
  ward: string;
  name: string;
  occupied: boolean;
  version: number;
};
export type Department = { id: string; name: string; version: number };
export type Ward = { id: string; name: string; departmentName: string; version: number };
export type Staff = Actor & { email: string; version: number };
export type StayRow = {
  id: string;
  number: number;
  name: string;
  patientNumber: number;
  location: string;
  status: string;
  admittedAt: string;
  version: number;
  balance?: string;
};
export type Item = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  minimum: number;
  price: string;
  version: number;
};
export type Service = {
  id: string;
  name: string;
  price: string;
  version: number;
};
export type Expense = {
  id: string;
  title: string;
  category: string;
  amount: string;
  date: string;
  voided: boolean;
  note: string;
};
export type Charge = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: string;
  voided: boolean;
  voidReason: string | null;
};
export type Payment = {
  id: string;
  number: number;
  amount: string;
  method: string;
  actorName: string;
  createdAt: string;
};
export type PatientDetail = StayRow & {
  phone: string;
  dob: string;
  sex: string;
  charges: Charge[];
  payments: Payment[];
  total: string;
  paid: string;
  balance: string;
  dischargedAt: string | null;
};
export type Snapshot = {
  actor: Actor;
  beds: Bed[];
  departments: Department[];
  wards: Ward[];
  stays: StayRow[];
  items: Item[];
  services: Service[];
  expenses: Expense[];
  users: Staff[];
  audit: { id: string; action: string; actorId: string; at: string }[];
  stats: {
    active: number;
    freeBeds: number;
    lowStock: number;
    received: string;
    spent: string;
  };
  revision: number;
  total: number;
  page: number;
  pages: number;
};
export const roles: Record<Role, string> = {
  admin: 'مدير',
  inventory: 'أمين مستودع',
  billing: 'محاسب',
  nurse: 'مسعف',
};
export const categories: Record<string, string> = {
  supplies: 'مستلزمات',
  salary: 'رواتب',
  maintenance: 'صيانة',
  utilities: 'خدمات وفواتير',
  other: 'أخرى',
};
export const methods: Record<string, string> = {
  cash: 'نقدًا',
  card: 'بطاقة',
  transfer: 'تحويل',
};
export const numeric = (v: number | string) =>
  new Intl.NumberFormat('ar-SY-u-nu-latn', { maximumFractionDigits: 2 }).format(Number(v));
export const decimal = (cents: string | number) => {
  const value = BigInt(cents),
    absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
};
export const currency = (cents: string | number) => {
  const [whole, fraction] = decimal(cents).split('.');
  return (
    new Intl.NumberFormat('ar-SY-u-nu-latn').format(BigInt(whole)) +
    (fraction === '00' ? '' : '.' + fraction) +
    ' ل.س'
  );
};
export const date = (v: string) =>
  new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
    dateStyle: 'medium',
    timeZone: 'Asia/Damascus',
  }).format(new Date(v));
export const canBill = (a: Actor) => ['admin', 'billing'].includes(a.role);
export const canCare = (a: Actor) => ['admin', 'nurse'].includes(a.role);
export const canStock = (a: Actor) => ['admin', 'inventory'].includes(a.role);
