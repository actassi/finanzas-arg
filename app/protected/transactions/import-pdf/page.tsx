import { Suspense } from "react";
import ImportPdfContent from "./ImportPdfContent";

export const runtime = "nodejs";

export default function ImportPdfPage(props: {
  searchParams: Promise<{ imported?: string; duplicate?: string }>;
}) {
  return (
    <Suspense fallback={<div className="p-8">Cargando...</div>}>
      <ImportPdfContent searchParams={props.searchParams} />
    </Suspense>
  );
}
