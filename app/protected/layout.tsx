import { DeployButton } from "@/components/deploy-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

import AppSidebar from "./AppSidebar";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col">
      {/* NAV */}
      <nav className="w-full border-b border-b-foreground/10 h-16">
        <div className="h-16 w-full flex items-center justify-center">
          <div className="w-full max-w-6xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>Next.js Supabase Starter</Link>
              <div className="flex items-center gap-2">
                <DeployButton />
              </div>
            </div>

            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </div>
      </nav>

      {/* CONTENT */}
      <div className="flex-1 w-full px-3 lg:px-6 py-6">
        <div className="flex flex-col lg:flex-row items-start gap-6">
          {/* Sidebar */}
          <aside className="w-full lg:w-56 shrink-0 lg:sticky lg:top-24">
            <AppSidebar />
          </aside>

          {/* Main */}
          <section className="flex-1 min-w-0 w-full">{children}</section>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-10">
        <p>
          Powered by{" "}
          <a
            href="https://supabase.com/?utm_source=create-next-app&utm_medium=template&utm_term=nextjs"
            target="_blank"
            className="font-bold hover:underline"
            rel="noreferrer"
          >
            Supabase
          </a>
        </p>
        <ThemeSwitcher />
      </footer>
    </main>
  );
}
