import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="boot">
      <h1>الصفحة غير موجودة</h1>
      <Link className="button primary" href="/">
        العودة إلى مساحة العمل
      </Link>
    </main>
  );
}
