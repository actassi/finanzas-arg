import type { ReactNode } from 'react';
import TransactionsSidebar from './TransactionsSidebar';

export default function TransactionsLayout({ children }: { children: ReactNode }) {
  return (
    // “Full-bleed”: rompe el contenedor centrado del layout padre
    <div className="relative left-1/2 right-1/2 ml-[-50vw] mr-[-50vw] w-screen px-6 lg:px-10">
      <div className="flex flex-col lg:flex-row items-start gap-6">
        {/* Sidebar: bien a la izquierda, angosta, no crece */}
        <aside className="w-full lg:w-56 xl:w-60 shrink-0 lg:sticky lg:top-24">
          <TransactionsSidebar />
        </aside>

        {/* Contenido: prioridad total */}
        <section className="flex-1 min-w-0 w-full">
          {children}
        </section>
      </div>
    </div>
  );
}
