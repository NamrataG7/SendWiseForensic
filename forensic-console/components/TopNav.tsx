import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';

/**
 * TopNav — official register-style navigation.
 *
 * Kept intentionally spare: name of the register on the left, section
 * links on the right. No colour block, hairline rule under.
 */
export default function TopNav({ isAdmin }: { isAdmin?: boolean }) {
  const links = isAdmin
    ? [
        { href: '/admin', label: 'Officers' },
        { href: '/admin/officers/new', label: 'Invite Officer' },
        { href: '/admin/counsel', label: 'Counsel Requests' },
      ]
    : [
        { href: '/cases', label: 'Cases' },
        { href: '/authorizations/new', label: 'Issue Authorization' },
        { href: '/audit', label: 'Audit Chain' },
        { href: '/counsel', label: 'Counsel Portal' },
      ];
  return (
    <header className="rule-under bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link href={isAdmin ? '/admin' : '/cases'} className="group flex items-baseline gap-3">
          <span className="font-serif text-xl font-semibold text-ink">
            SendWise<span className="text-primary">Forensic</span>
          </span>
          <span className="hidden text-xs uppercase tracking-register text-muted sm:inline">
            {isAdmin ? 'Administration' : 'Court-Ordered Digital Supervision'}
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-ink motion-fade"
            >
              {l.label}
            </Link>
          ))}
          <LogoutButton className="ml-3 text-xs uppercase tracking-widest text-slate-600 hover:text-red-700 border border-slate-300 hover:border-red-700 px-3 py-2" />
        </nav>
      </div>
    </header>
  );
}
