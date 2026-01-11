// lib/pdf/macroVisaStatementParser.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';

import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import sharp from "sharp";

// pdfjs-dist en Node (legacy)
async function getPdfjs() {
  // Import dinámico para evitar problemas de bundling en Next
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return await import("pdfjs-dist/legacy/build/pdf.mjs");
}

export type MacroVisaParsedTx = {
  date: string; // YYYY-MM-DD
  description: string;
  amount_ars: number; // positivo
  amount_usd?: number; // opcional
  receipt?: string | null;
  installment_number?: number | null;
  installments_total?: number | null;
  raw_line?: string;
  type?: "expense" | "payment" | "fee" | "income" | "transfer" | "other";
};

export type MacroVisaStatementMeta = {
  due_date?: string | null; // YYYY-MM-DD
  cut_off_date?: string | null; // YYYY-MM-DD
  statement_period_start?: string | null;
  statement_period_end?: string | null;
};

export type MacroVisaParseResult = {
  meta: MacroVisaStatementMeta;
  transactions: MacroVisaParsedTx[];
};

type OcrWord = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  conf?: number;
  lineKey: string; // agrupación por fila
};

const MONTHS_MAP: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function toISODateFromSpanish(d: string, month: string, yy: string): string | null {
  const dd = String(d).padStart(2, "0");
  const mKey = stripAccents(month.trim().toLowerCase());
  const mm = MONTHS_MAP[mKey];
  if (!mm) return null;

  const y2 = Number(yy);
  // Regla simple: 00-69 -> 2000-2069, 70-99 -> 1970-1999 (ajustá si te hiciera falta)
  const yyyy = y2 <= 69 ? 2000 + y2 : 1900 + y2;
  return `${yyyy}-${mm}-${dd}`;
}

function parseMoneyAR(s: string): number | null {
  // Ejemplos: 164.977,66  | 247.757,72- | 0,00
  const t = s.trim();
  if (!t) return null;

  const neg = /-$/.test(t);
  const cleaned = t.replace(/[^0-9.,-]/g, "").replace(/-$/g, "");
  if (!cleaned) return null;

  // miles con . y decimales con ,
  const normalized = cleaned.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;

  return neg ? -n : n;
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function detectInstallments(desc: string) {
  // C.02/12 o C 02/12 (case-insensitive)
  const m = desc.match(/\bC\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i);
  if (!m) return { desc, installment_number: null as number | null, installments_total: null as number | null };

  const n = Number(m[1]);
  const t = Number(m[2]);

  const cleaned = normalizeSpaces(desc.replace(m[0], "").replace(/\(\s*\)/g, ""));
  return {
    desc: cleaned,
    installment_number: Number.isFinite(n) ? n : null,
    installments_total: Number.isFinite(t) ? t : null,
  };
}

function inferType(descUpper: string): MacroVisaParsedTx["type"] {
  if (descUpper.includes("SU PAGO")) return "payment";
  if (
    descUpper.includes("IMPUEST") ||
    descUpper.includes("PERCEPC") ||
    descUpper.includes("IVA") ||
    descUpper.includes("SELLO") ||
    descUpper.includes("COMISION") ||
    descUpper.includes("CARGO") ||
    descUpper.includes("INTERES")
  ) {
    return "fee";
  }
  return "expense";
}

/**
 * Renderiza una página a PNG (300-380 DPI aprox por scale).
 */
async function renderPdfPageToPng(pdfBuffer: Buffer, pageNumber1Based: number, scale = 2.8) {
  const pdfjs = await getPdfjs();
  const pdfData = Uint8Array.from(pdfBuffer);
  const loadingTask = pdfjs.getDocument({ data: pdfData, disableWorker: true });
  const pdf = await loadingTask.promise;

  const page = await pdf.getPage(pageNumber1Based);
  const viewport = page.getViewport({ scale });

  const { createCanvas } = await import("@napi-rs/canvas");
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");

  await page.render({ canvasContext: ctx as any, viewport }).promise;

  // @napi-rs/canvas
  return canvas.toBuffer("image/png");
}

/**
 * OCR TSV con tesseract CLI:
 * Requiere tener instalado tesseract en el PATH.
 *
 * Windows: instalador UB Mannheim
 * Linux: apt-get install tesseract-ocr tesseract-ocr-spa
 */
async function ocrTsvWithTesseractCli(pngBuffer: Buffer, lang = "spa", psm = 6): Promise<string> {
  const tmpDir = os.tmpdir();
  const inPath = path.join(tmpDir, `macrovisa-${randomUUID()}.png`);
  await fs.writeFile(inPath, pngBuffer);

  try {
    const args = [
      inPath,
      "stdout",
      "-l",
      lang,
      "--psm",
      String(psm),
      "tsv",
    ];

    const tsv = await new Promise<string>((resolve, reject) => {
      const proc = spawn("tesseract", args, { stdio: ["ignore", "pipe", "pipe"] });

      let out = "";
      let err = "";

      proc.stdout.on("data", (d) => (out += String(d)));
      proc.stderr.on("data", (d) => (err += String(d)));

      proc.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(
            new Error(
              "Tesseract no está instalado o no está en el PATH. " +
                "Instalá tesseract-ocr (y tesseract-ocr-spa) para habilitar el OCR."
            )
          );
          return;
        }
        reject(err);
      });
      proc.on("close", (code) => {
        if (code === 0 && out.trim()) resolve(out);
        else reject(new Error(`tesseract failed (code ${code}): ${err || "no stderr"}`));
      });
    });

    return tsv;
  } finally {
    // Limpieza best-effort
    fs.unlink(inPath).catch(() => {});
  }
}

function parseTsvToWords(tsv: string): OcrWord[] {
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  // TSV header: level page_num block_num par_num line_num word_num left top width height conf text
  const header = lines.shift();
  if (!header) return [];

  const words: OcrWord[] = [];

  for (const row of lines) {
    const cols = row.split("\t");
    if (cols.length < 12) continue;

    const level = Number(cols[0]);
    const line_num = cols[4];
    const word_num = cols[5];
    const left = Number(cols[6]);
    const top = Number(cols[7]);
    const width = Number(cols[8]);
    const height = Number(cols[9]);
    const conf = Number(cols[10]);
    const text = (cols[11] ?? "").trim();

    // level 5 suele ser "word"
    if (level !== 5) continue;
    if (!text) continue;
    if (!Number.isFinite(left) || !Number.isFinite(top)) continue;

    words.push({
      text,
      left,
      top,
      width,
      height,
      conf: Number.isFinite(conf) ? conf : undefined,
      lineKey: `${line_num}:${word_num ? line_num : line_num}`, // clave base
    });
  }

  return words;
}

function groupWordsByLine(words: OcrWord[], yTolerance = 10) {
  // Agrupar por "top" aproximado (más robusto que line_num si el TSV varía)
  const sorted = [...words].sort((a, b) => a.top - b.top || a.left - b.left);
  const groups: Array<{ top: number; words: OcrWord[] }> = [];

  for (const w of sorted) {
    const g = groups.length ? groups[groups.length - 1] : null;
    if (!g || Math.abs(w.top - g.top) > yTolerance) {
      groups.push({ top: w.top, words: [w] });
    } else {
      g.words.push(w);
      // suavizamos el top promedio
      g.top = Math.round((g.top * (g.words.length - 1) + w.top) / g.words.length);
    }
  }

  // ordenar palabras por X dentro de cada línea
  for (const g of groups) g.words.sort((a, b) => a.left - b.left);
  return groups;
}

/**
 * Extrae metadata (due_date / cut_off_date / periodos) desde header (OCR chico).
 * Ajustá los crops si tu PDF difiere levemente.
 */
async function extractMetaFromHeader(pagePng: Buffer): Promise<MacroVisaStatementMeta> {
  // Crop aproximado de la zona superior derecha (vencimiento / cierre / período)
  const metaCrop = await sharp(pagePng)
    .extract({
      left: Math.round((await sharp(pagePng).metadata()).width! * 0.52),
      top: Math.round((await sharp(pagePng).metadata()).height! * 0.07),
      width: Math.round((await sharp(pagePng).metadata()).width! * 0.45),
      height: Math.round((await sharp(pagePng).metadata()).height! * 0.22),
    })
    .grayscale()
    .normalize()
    .toBuffer();

  let tsv = "";
  try {
    tsv = await ocrTsvWithTesseractCli(metaCrop, "spa", 6);
  } catch {
    return {};
  }

  const text = normalizeSpaces(
    tsv
      .split(/\r?\n/)
      .slice(1)
      .map((r) => r.split("\t")[11] ?? "")
      .join(" ")
  );

  // Buscar dd/mm/aaaa
  const dates = [...text.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)].map((m) => ({
    iso: `${m[3]}-${m[2]}-${m[1]}`,
    raw: m[0],
  }));

  // Heurística:
  // - primera fecha que aparezca cercana a “VENC” => due_date
  // - primera fecha cercana a “CIER” / “CORTE” => cut_off_date
  const upper = stripAccents(text).toUpperCase();

  const findClosest = (keyword: string) => {
    const idx = upper.indexOf(keyword);
    if (idx < 0) return null;
    // elegimos la fecha con menor distancia de índice (aprox)
    let best: { iso: string; dist: number } | null = null;
    for (const d of dates) {
      const di = upper.indexOf(d.raw);
      if (di < 0) continue;
      const dist = Math.abs(di - idx);
      if (!best || dist < best.dist) best = { iso: d.iso, dist };
    }
    return best?.iso ?? null;
  };

  const due = findClosest("VENC");
  const cut = findClosest("CIER") ?? findClosest("CORTE");

  // Periodo: a veces aparece “PERIODO xx/xx/xxxx AL xx/xx/xxxx”
  let pStart: string | null = null;
  let pEnd: string | null = null;
  const per = upper.match(/PERIODO.*?(\d{2}\/\d{2}\/\d{4}).*?(AL|-)\s*(\d{2}\/\d{2}\/\d{4})/);
  if (per) {
    const [d1, d2] = [per[1], per[3]].map((s) => {
      const mm = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      return mm ? `${mm[3]}-${mm[2]}-${mm[1]}` : null;
    });
    pStart = d1;
    pEnd = d2;
  }

  return {
    due_date: due,
    cut_off_date: cut,
    statement_period_start: pStart,
    statement_period_end: pEnd,
  };
}

/**
 * Parser principal: Macro/Visa (OCR).
 * - Page 1: tabla de consumos/movimientos (y header meta)
 * - Page 2+: ignorado (por ahora)
 */
export async function parseMacroVisaStatementPdf(pdfBuffer: Buffer): Promise<MacroVisaParseResult> {
  // 1) Render Page 1
  const page1Png = await renderPdfPageToPng(pdfBuffer, 1, 3.0);

  // 2) Meta (opcional)
  const meta = await extractMetaFromHeader(page1Png);

  // 3) Crop tabla (ajustable)
  const pageMeta = await sharp(page1Png).metadata();
  const W = pageMeta.width ?? 0;
  const H = pageMeta.height ?? 0;

  // Región aproximada donde está el listado (ajustá si tu layout cambia)
  const tableRegion = {
    left: Math.round(W * 0.06),
    top: Math.round(H * 0.20),
    width: Math.round(W * 0.88),
    height: Math.round(H * 0.62),
  };

  const tablePng = await sharp(page1Png)
    .extract(tableRegion)
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer();

  // 4) OCR TSV
  const tsv = await ocrTsvWithTesseractCli(tablePng, "spa", 6);

  // 5) TSV -> palabras -> líneas
  const words = parseTsvToWords(tsv);

  // Filtrar palabras basura por confianza muy baja (ajustable)
  const wordsOk = words.filter((w) => (w.conf ?? 100) >= 35);

  const lines = groupWordsByLine(wordsOk, 14).map((g) => ({
    top: g.top,
    text: normalizeSpaces(g.words.map((w) => w.text).join(" ")),
    words: g.words,
  }));

  // 6) Parse líneas a transacciones
  const transactions: MacroVisaParsedTx[] = [];

  for (const ln of lines) {
    const raw = ln.text;

    // Filtrar encabezados típicos / totales / ruido
    const up = stripAccents(raw).toUpperCase();
    if (
      !raw ||
      up.startsWith("FECHA ") ||
      up.includes("DETALLE") ||
      up.includes("SALDO") && up.includes("ANTERIOR") ||
      up.includes("TOTAL") && up.includes("CONSUMOS") ||
      up.startsWith("TARJETA") ||
      up.startsWith("CUOTAS") ||
      up.includes("WWW.") ||
      up.includes("VISA") && up.includes("MACRO")
    ) {
      continue;
    }

    // Detectar inicio con fecha: "31 Octubre 25 ..."
    const m = raw.match(/^\s*(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\d{2})\s+(.*)$/);
    if (!m) continue;

    const iso = toISODateFromSpanish(m[1], m[2], m[3]);
    if (!iso) continue;

    const tail = normalizeSpaces(m[4] ?? "");

    // Detectar importes por palabras “amount-like” cerca del final / derecha
    const amountTokens = ln.words
      .map((w) => ({ ...w, t: w.text.replace(/\s/g, "") }))
      .filter((w) => /^[0-9]{1,3}(\.[0-9]{3})*,[0-9]{2}-?$/.test(w.t) || /^[0-9]+,[0-9]{2}-?$/.test(w.t))
      .sort((a, b) => a.left - b.left);

    let ars: number | null = null;
    let usd: number | null = null;

    if (amountTokens.length === 1) {
      ars = parseMoneyAR(amountTokens[0].t);
    } else if (amountTokens.length >= 2) {
      // Heurística: último token a la derecha suele ser USD si la tabla tiene 2 columnas (ARS + USD)
      // Si tu layout es distinto, ajustamos este criterio por umbral X.
      const last = amountTokens[amountTokens.length - 1];
      const prev = amountTokens[amountTokens.length - 2];

      // Umbral relativo: si el último está muy a la derecha, lo tomamos como USD
      const isUsdColumn = last.left > Math.round(tableRegion.width * 0.78);

      if (isUsdColumn) {
        usd = parseMoneyAR(last.t);
        ars = parseMoneyAR(prev.t);
      } else {
        // si no hay columna USD clara, tomamos el último como ARS
        ars = parseMoneyAR(last.t);
      }
    }

    if (ars == null && usd == null) {
      // sin importes detectables: ignorar
      continue;
    }

    // Receipt (comprobante numérico) al inicio del tail
    // Ej: "0000801 * COMERCIO ..." o "035500 * ..."
    let receipt: string | null = null;
    let desc0 = tail;

    const rcp = tail.match(/^(\d{5,8})\s+(.*)$/);
    if (rcp) {
      receipt = rcp[1];
      desc0 = rcp[2] ?? "";
    }

    // Limpieza de marcadores
    desc0 = normalizeSpaces(desc0.replace(/^\*\s*/, "")); // "* " inicial
    desc0 = desc0.replace(/\s{2,}/g, " ").trim();

    // Cuotas
    const inst = detectInstallments(desc0);

    // Tipo
    const type = inferType(stripAccents(inst.desc).toUpperCase());

    // Normalizar importes: tu app trabaja con positivos (según tu criterio previo)
    const amount_ars = Math.abs(Number(ars ?? 0));
    const amount_usd = usd != null ? Math.abs(Number(usd)) : undefined;

    // Regla simple: ignorar líneas que parecen “resumen/encabezado” aunque tengan números
    if (!inst.desc || inst.desc.length < 3) continue;

    transactions.push({
      date: iso,
      description: inst.desc,
      amount_ars,
      amount_usd,
      receipt,
      installment_number: inst.installment_number,
      installments_total: inst.installments_total,
      raw_line: raw,
      type,
    });
  }

  // Orden por fecha asc (opcional; ajustá a tu preferencia)
  transactions.sort((a, b) => a.date.localeCompare(b.date));

  return { meta, transactions };
}
