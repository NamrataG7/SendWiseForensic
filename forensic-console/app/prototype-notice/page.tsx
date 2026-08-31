import Link from 'next/link';
import fs from 'node:fs/promises';
import path from 'node:path';
import TopNav from '@/components/TopNav';
import PageHeader from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Prototype Notice — SendWiseForensic',
};

async function readNotice(): Promise<string> {
  // The notice lives at repo-root /docs/PROTOTYPE_NOTICE.md.
  // forensic-console is one directory deep, so ../docs.
  const p = path.join(process.cwd(), '..', 'docs', 'PROTOTYPE_NOTICE.md');
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return '# Prototype Notice\n\nSource file not found at build time. See repository docs/PROTOTYPE_NOTICE.md.';
  }
}

export default async function PrototypeNoticePage() {
  const md = await readNotice();
  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Notice"
          title="Prototype notice"
          subtitle="This file is the canonical statement of what is stubbed, what is real, and what must be replaced before any pilot."
        />
        <article className="mt-8 whitespace-pre-wrap border border-slate-200 bg-white p-8 font-mono text-[13px] leading-relaxed text-ink">
          {md}
        </article>
        <p className="mt-6 text-xs text-muted">
          <Link href="/cases" className="text-primary hover:underline">
            ← Back to console
          </Link>
        </p>
      </main>
    </>
  );
}
