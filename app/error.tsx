'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="boot">
      <h1>تعذر فتح الصفحة</h1>
      <p>حاول مجددًا. إذا استمرت المشكلة، تواصل مع مسؤول المنشأة.</p>
      <button className="button primary" onClick={reset}>
        إعادة المحاولة
      </button>
    </main>
  );
}
