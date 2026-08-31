import type { Metadata } from 'next';
import PrototypeBanner from '@/components/PrototypeBanner';
import './globals.css';

export const metadata: Metadata = {
  title: 'SendWiseForensic — Court-Ordered Digital Supervision',
  description:
    'Warrant-gated digital supervision console. Prototype — not for production use.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <PrototypeBanner />
        {children}
      </body>
    </html>
  );
}
