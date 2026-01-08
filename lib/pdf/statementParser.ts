// lib/pdf/statementParser.ts
import "server-only";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type Tx = {
  date: string; // ISO yyyy-mm-dd
  description: string; // solo alfabética (normalizada)
  receipt: string | null; // comprobante
  installmentNumber: number | null;
  installmentsTotal: number | null;
  amount: number; // ARS
};

type Item = { str: string; x: number; y: number };

// Acepta 25-10-25 o 25.10.25
const DATE_RE = /^\d{2}[.-]\d{2}[.-]\d{2}$/;
const AMOUNT_RE = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const INST_RE = /^(\d{2})\/(\d{2})$/;

function parseDateDDMMYY(s: string): string {
  const norm = s.replace(/\./g, "-");
  const [dd, mm, yy] = norm.split("-").map(Number);
  const yyyy = 2000 + yy;
  return new Date(Date.UTC(yyyy, mm - 1, dd)).toISOString().slice(0, 10);
}

function parseArs(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

function normalizeDescription(raw: string): string {
  return raw
    .replace(/[*]/g, " ")
    .replace(/[0-9]/g, " ")
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza para comparar "etiquetas" (case-insensitive, sin tildes, espacios colapsados).
 * Útil para filtrar descripciones especiales como "SU PAGO EN PESOS".
 */
function normalizeForCompare(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function groupByLine(items: Item[], yTol = 2): Item[][] {
  const bins = new Map<number, Item[]>();
  for (const it of items) {
    const key = Math.round(it.y / yTol);
    const arr = bins.get(key) ?? [];
    arr.push(it);
    bins.set(key, arr);
  }
  return [...bins.values()].map((line) => line.sort((a, b) => a.x - b.x));
}

function detectColumnBounds(items: Item[]) {
  const xOf = (label: string) => {
    const up = label.toUpperCase();
    const hits = items.filter((i) => i.str.toUpperCase() === up);
    hits.sort((a, b) => b.y - a.y);
    return hits[0]?.x ?? null;
  };

  const xCuota = xOf("CUOTA");
  const xComp = xOf("COMPROBANTE");
  const xPesos = xOf("PESOS");
  const xDol = xOf("DÓLARES") ?? xOf("DOLARES");

  const _xCuota = xCuota ?? 320;
  const _xComp = xComp ?? 365;
  const _xPesos = xPesos ?? 467;
  const _xDol = xDol ?? 542;

  const bDescToCuota = _xCuota - 5;
  const bCuotaToComp = (_xCuota + _xComp) / 2;
  const bCompToPesos = (_xComp + _xPesos) / 2;
  const bPesosToDol = (_xPesos + _xDol) / 2;

  return {
    dateMaxX: 70,
    refMinX: 70,
    refMaxX: 85,
    descMinX: 85,
    descMaxX: bDescToCuota,
    cuotaMinX: bDescToCuota,
    cuotaMaxX: bCuotaToComp,
    compMinX: bCuotaToComp,
    compMaxX: bCompToPesos,
    pesosMinX: bCompToPesos,
    pesosMaxX: bPesosToDol,
  };
}

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type TextItem = { str: string; transform: number[] };

let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

      // Worker importable por Node (ESM): file://... (evita el "[project]" de Turbopack)
      const workerPath = path.join(
        process.cwd(),
        "node_modules",
        "pdfjs-dist",
        "legacy",
        "build",
        "pdf.worker.mjs"
      );
      pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString();

      return pdfjsLib;
    })();
  }
  return pdfjsPromise;
}

export async function parseVisaPdf(buffer: Buffer): Promise<Tx[]> {
  const pdfjsLib = await getPdfJs();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  });

  const pdf = await loadingTask.promise;
  const out: Tx[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();

    const items: Item[] = (tc.items as TextItem[])
      .map((it) => {
        const t = it.transform; // [a,b,c,d,e,f] => e=x, f=y
        return { str: String(it.str).trim(), x: t[4], y: t[5] };
      })
      .filter((i) => i.str.length > 0);

    const bounds = detectColumnBounds(items);
    const lines = groupByLine(items, 2);

    for (const line of lines) {
      const dateTok = line.find((t) => t.x < bounds.dateMaxX && DATE_RE.test(t.str))?.str;
      if (!dateTok) continue;

      const amountTok = line.find(
        (t) => t.x >= bounds.pesosMinX && t.x < bounds.pesosMaxX && AMOUNT_RE.test(t.str)
      )?.str;
      if (!amountTok) continue;

      const descRaw = line
        .filter((t) => t.x >= bounds.descMinX && t.x < bounds.descMaxX)
        .map((t) => t.str)
        .join(" ")
        .trim();

      const cuotaRaw = line
        .filter((t) => t.x >= bounds.cuotaMinX && t.x < bounds.cuotaMaxX)
        .map((t) => t.str)
        .join(" ")
        .trim();

      const compRaw = line
        .filter((t) => t.x >= bounds.compMinX && t.x < bounds.compMaxX)
        .map((t) => t.str)
        .join(" ")
        .trim();

      let installmentNumber: number | null = null;
      let installmentsTotal: number | null = null;
      const m = cuotaRaw.match(INST_RE);
      if (m) {
        installmentNumber = Number(m[1]);
        installmentsTotal = Number(m[2]);
      }

      const description = normalizeDescription(descRaw);
      if (!description) continue;

      // EXCLUSIÓN: "SU PAGO EN PESOS" no se considera consumo/gasto -> no se parsea
      if (normalizeForCompare(description) === "SU PAGO EN PESOS") continue;

      out.push({
        date: parseDateDDMMYY(dateTok),
        description,
        receipt: compRaw ? compRaw.replace(/\D/g, "") : null,
        installmentNumber,
        installmentsTotal,
        amount: parseArs(amountTok),
      });
    }
  }

  return out;
}

// Alias para mantener compatibilidad con tu código existente
export async function parseStatementPdf(buffer: Buffer): Promise<Tx[]> {
  return parseVisaPdf(buffer);
}
