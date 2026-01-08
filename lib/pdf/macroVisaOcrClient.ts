'use client';

import * as pdfjsLib from 'pdfjs-dist';
import { createWorker, type Worker } from 'tesseract.js';

export type MacroVisaParsedRow = {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // en ARS (heurística)
  amount_usd?: number | null; // opcional, si viene
  receipt?: string | null;
  installmentNumber?: number | null;
  installmentsTotal?: number | null;
};

// --- PDF.js worker (browser) ---
let pdfWorkerConfigured = false;
function ensurePdfWorker() {
  if (pdfWorkerConfigured) return;
  // Nota: con bundlers modernos esto suele resolver bien.
  // Si tu build se queja, alternativa: deshabilitar worker (más lento) -> (pdfjsLib as any).disableWorker = true;
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  pdfWorkerConfigured = true;
}

// --- Tesseract worker cache ---
let ocrWorkerPromise: Promise<Worker> | null = null;

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const w = await createWorker('spa');
      // PSM 6 = "Assume a single uniform block of text" -> en este PDF dio líneas completas (incluye importes)
      await w.setParameters({
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1',
      });
      return w;
    })();
  }
  return ocrWorkerPromise;
}

function norm(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

// Heurísticas para día OCR (04 -> 84, 05 -> "es", etc.)
function parseDayToken(tok: string): number | null {
  const t = norm(tok);
  const digits = t.replace(/\D/g, '');
  if (digits) {
    let d = parseInt(digits, 10);
    // Casos OCR típicos: 84 -> 04, 86 -> 06
    if (d >= 80 && d <= 89) d = d - 80;
    if (d >= 60 && d <= 69) d = d - 60;
    if (d > 31) d = d % 10;
    if (d >= 1 && d <= 31) return d;
  }

  // Casos como "es" = 05 (observado)
  if (t === 'es' || t === 'os' || t === 'ss') return 5;

  return null;
}

function parseMoneyToNumber(s: string): number | null {
  let t = s.trim();
  if (!t) return null;

  let neg = false;
  if (t.endsWith('-')) {
    neg = true;
    t = t.slice(0, -1);
  }

  // dejar solo dígitos y separadores
  t = t.replace(/[^\d.,]/g, '');

  // si tiene . y , => . miles, , decimales
  if (t.includes('.') && t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (t.includes(',')) {
    // solo coma -> decimal
    t = t.replace(',', '.');
  }

  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

// Intenta parsear una línea del OCR tipo:
// "04 Julio 25 396823 * MERPAGO*... C.05/06 141.241,29"
function parseMacroLine(line: string): MacroVisaParsedRow | null {
  const raw = line.replace(/\s+/g, ' ').trim();
  if (!raw) return null;

  const tokens = raw.split(' ');
  // detectar mes
  const monthIdx = tokens.findIndex((tk) => MONTHS[norm(tk)] != null);
  if (monthIdx < 1 || monthIdx + 1 >= tokens.length) return null;

  const monthName = norm(tokens[monthIdx]);
  const month = MONTHS[monthName];
  const dayTok = tokens[monthIdx - 1];
  const yyTok = tokens[monthIdx + 1];

  const day = parseDayToken(dayTok);
  const yy = parseInt(yyTok.replace(/\D/g, ''), 10);

  if (!day || !Number.isFinite(yy)) return null;
  const year = yy < 100 ? 2000 + yy : yy;

  const isoDate = `${year}-${pad2(month)}-${pad2(day)}`;

  // el resto arranca después del año
  let idx = monthIdx + 2;

  // receipt opcional (número)
  let receipt: string | null = null;
  if (idx < tokens.length && /^\d{3,}$/.test(tokens[idx])) {
    receipt = tokens[idx];
    idx++;
  }

  // consumir "*" opcional
  if (idx < tokens.length && tokens[idx] === '*') idx++;

  const restStr = tokens.slice(idx).join(' ');

  // cuotas
  let installmentNumber: number | null = null;
  let installmentsTotal: number | null = null;

  const instMatch = restStr.match(/\bC\.\s*(\d{2})\s*\/\s*(\d{2})\b/i);
  if (instMatch) {
    installmentNumber = Number(instMatch[1]);
    installmentsTotal = Number(instMatch[2]);
    if (!Number.isFinite(installmentNumber)) installmentNumber = null;
    if (!Number.isFinite(installmentsTotal)) installmentsTotal = null;
  }

  // montos: buscamos al final (1 o 2 columnas)
  const moneyRe = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+,\d{2})/g;
  const matches = Array.from(restStr.matchAll(moneyRe));
  if (!matches.length) return null;

  // tomar último / dos últimos como montos
  const last = matches[matches.length - 1];
  const prev = matches.length >= 2 ? matches[matches.length - 2] : null;

  const hasUsdHint = /\bUSD\b/i.test(restStr);

  let amountUsd: number | null = null;
  let amountArs: number | null = null;

  if (hasUsdHint && prev) {
    amountArs = parseMoneyToNumber(prev[1]);
    amountUsd = parseMoneyToNumber(last[1]);
  } else {
    amountArs = parseMoneyToNumber(last[1]);
    amountUsd = null;
  }

  if (amountArs == null || !Number.isFinite(amountArs)) return null;

  // Heurística: si viene USD y el ARS quedó “chico” (ej 28,68) probablemente faltaron miles -> *1000
  if (hasUsdHint && amountUsd != null && amountArs > 0 && amountArs < 1000 && amountUsd > 0) {
    amountArs = amountArs * 1000;
  }

  // descripción: cortar antes del primer monto usado (prev si usamos dos, sino last)
  const cutAt = hasUsdHint && prev ? (prev.index ?? -1) : (last.index ?? -1);
  let descPart = cutAt >= 0 ? restStr.slice(0, cutAt).trim() : restStr.trim();

  // remover cuotas del desc
  descPart = descPart.replace(/\bC\.\s*\d{2}\s*\/\s*\d{2}\b/gi, '').trim();

  // limpiar separadores residuales
  descPart = descPart.replace(/\s+\*\s+/g, ' * ').trim();

  if (!descPart) return null;

  return {
    date: isoDate,
    receipt,
    description: descPart,
    amount: Math.abs(Number(amountArs)),
    amount_usd: amountUsd != null && Number.isFinite(amountUsd) ? Math.abs(Number(amountUsd)) : null,
    installmentNumber,
    installmentsTotal,
  };
}

export async function parseMacroVisaStatementPdf(file: File): Promise<MacroVisaParsedRow[]> {
  ensurePdfWorker();

  const ab = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({ data: ab });
  const pdf = await loadingTask.promise;

  // Este PDF (descarga.pdf) trae consumos en la 1ra página; la 2da es texto legal
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 2.0 }); // subí a 2.5/3.0 si necesitás más precisión
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar canvas 2D.');

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Crop por ratios (ajustado a tu PDF ejemplo)
  // (x=4%, y=33%, w=92%, h=62%)
  const crop = {
    x: Math.floor(canvas.width * 0.04),
    y: Math.floor(canvas.height * 0.33),
    w: Math.floor(canvas.width * 0.92),
    h: Math.floor(canvas.height * 0.62),
  };

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = crop.w;
  cropCanvas.height = crop.h;
  const cctx = cropCanvas.getContext('2d');
  if (!cctx) throw new Error('No se pudo inicializar canvas de recorte.');

  cctx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

  const worker = await getOcrWorker();
  const { data } = await worker.recognize(cropCanvas);

  const lines = (data.lines ?? [])
    .map((l) => String((l as any).text ?? '').trim())
    .filter(Boolean);

  const rows: MacroVisaParsedRow[] = [];
  for (const ln of lines) {
    const r = parseMacroLine(ln);
    if (r) rows.push(r);
  }

  // de-dup por (date + receipt + amount + description prefix)
  const seen = new Set<string>();
  const uniq: MacroVisaParsedRow[] = [];
  for (const r of rows) {
    const key = `${r.date}|${r.receipt ?? ''}|${r.amount}|${norm(r.description).slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(r);
  }

  return uniq;
}
