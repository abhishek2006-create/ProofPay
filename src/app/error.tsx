'use client';
import Link from 'next/link';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="legal-page">
      <h1>Something needs attention.</h1>
      <p>
        We could not load this page. If the database is not running, follow the PostgreSQL setup in
        the README.
      </p>
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
      <Link className="btn" href="/">
        Back home
      </Link>
    </main>
  );
}
