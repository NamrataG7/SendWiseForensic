import type { Metadata } from 'next';
import PrototypeBanner from '@/components/PrototypeBanner';
import JurisdictionStatusBar from '@/components/JurisdictionStatusBar';
import { JurisdictionProvider } from '@/components/JurisdictionContext';
import { getViewJurisdiction } from '@/lib/view-jurisdiction';
import './globals.css';

export const metadata: Metadata = {
  title: 'SendWiseForensic — Court-Ordered Digital Supervision',
  description:
    'Warrant-gated digital supervision console. Prototype — not for production use.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jurisdiction = await getViewJurisdiction();
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <PrototypeBanner />
        <JurisdictionStatusBar jurisdiction={jurisdiction} />
        <JurisdictionProvider value={jurisdiction}>
          {children}
        </JurisdictionProvider>
      </body>
    </html>
  );
}
