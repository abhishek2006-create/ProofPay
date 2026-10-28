import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ProofPay — Clear work. Confident payments.',
  description: 'Evidence-backed milestone acceptance and PayPal sandbox payments.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
