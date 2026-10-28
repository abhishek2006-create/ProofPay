import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="legal-page">
      <h1>This page isn’t here.</h1>
      <p className="muted">Return to your workspace to find your projects.</p>
      <Link className="btn primary" href="/dashboard">
        Open workspace
      </Link>
    </main>
  );
}
