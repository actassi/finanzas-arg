'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/protected/transactions', label: 'Transacciones' },
  { href: '/protected/transactions/import-pdf', label: 'Importar PDF' },
];

function isActive(pathname: string, href: string) {
  if (href === '/protected/transactions') return pathname === href;
  return pathname.startsWith(href);
}

export default function TransactionsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
      <div className="px-2 py-1 text-xs text-slate-400">Atajos</div>

      <div className="mt-1 flex flex-col gap-1">
        {items.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={[
                'rounded-lg px-3 py-2 text-sm border transition-colors',
                active
                  ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
                  : 'bg-transparent text-slate-200 border-transparent hover:bg-slate-800 hover:border-slate-700',
              ].join(' ')}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
