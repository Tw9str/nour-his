import type { Metadata } from 'next';
import '@fontsource-variable/noto-sans-arabic';
import './globals.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'نور | إدارة المنشأة',
  description: 'إدارة المرضى والفواتير والمخزون على الشبكة المحلية',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
