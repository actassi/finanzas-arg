"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const items = [
  { href: "/protected/transactions", label: "Transacciones" },
  { href: "/protected/transactions/import-pdf", label: "Importar PDF" },
  { href: "/protected/transactions/new", label: "Nueva transacción" },
  { href: "/protected/reports", label: "Visualizaciones" },
  { href: "/protected/categories", label: "Categorías" },
  { href: "/protected/accounts", label: "Cuentas" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Preserva contexto entre /transactions y /reports:
 * - from/to (inputs)
 * - account
 * - batch
 * - useDate (si lo usás para alternar lógica por fecha real)
 */
const PRESERVE_KEYS = ["from", "to", "account", "batch", "useDate"];

function shouldPreserve(href: string) {
  return href === "/protected/transactions" || href === "/protected/reports";
}

export default function AppSidebar() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [queryString, setQueryString] = useState("");

  useEffect(() => {
    const usp = new URLSearchParams();
    for (const k of PRESERVE_KEYS) {
      const v = sp.get(k);
      if (v && v.trim() !== "") usp.set(k, v);
    }
    setQueryString(usp.toString());
  }, [sp]);

  const withPreservedQuery = useMemo(() => {
    return (href: string) => {
      if (!shouldPreserve(href)) return href;
      return queryString ? `${href}?${queryString}` : href;
    };
  }, [queryString]);

  return (
    <nav className="rounded-xl border border-slate-800 bg-slate-900/70 p-2">
      <div className="px-2 py-1 text-[10px] text-slate-400">Atajos</div>

      <div className="mt-1 flex flex-col gap-1">
        {items.map((it) => {
          const active = isActive(pathname, it.href);
          return (
            <Link
              key={it.href}
              href={withPreservedQuery(it.href)}
              className={[
                "w-full rounded-lg px-3 py-2 text-[13px] border transition-colors",
                active
                  ? "bg-emerald-500/15 text-emerald-200 border-emerald-500/30"
                  : "bg-transparent text-slate-200 border-transparent hover:bg-slate-800 hover:border-slate-700",
              ].join(" ")}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
