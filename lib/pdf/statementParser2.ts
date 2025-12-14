// lib/pdf/statementParser.ts
import pdfParse from 'pdf-parse';

export type ParsedStatementRow = {
  date: string;                 // ISO YYYY-MM-DD
  description: string;
  amount: number;
  installmentNumber: number | null;
  installmentsTotal: number | null;
  receipt: string | null;
};

// Fecha en cualquier parte de la línea: 12.03.24, 12-03-2024, 12/03/24, etc.
const DATE_IN_LINE_REGEX = /(\d{2})[.\-\/](\d{2})[.\-\/](\d{2,4})/;

// Importe en formato argentino: 0,00 / 000,00 / 1.234,56 / 123.456,78 / etc.
// Signo opcional al inicio O al final.
const STRICT_AMOUNT_REGEX = /-?\d{1,3}(?:\.\d{3})*,\d{2}-?/g;

// Palabras que NO queremos importar como consumo (pagos, etc.)
const PAYMENT_LINE_REGEX = /SU PAGO EN/i;

// Palabras que marcan final de detalle (totales, saldos, etc.) para recortar al final
const TRAILING_TOTAL_REGEX =
  /\b(TOTAL|SALDO|RESUMEN|VENCIMIENTO|PAGO M[IÍ]NIMO)\b/i;

// Palabras que identifican impuestos de sellos
const STAMP_DUTY_REGEX =
  /(SELLO|SELLOS|IMPUESTO[S]?\s+DE\s+SELLOS?)/i;

// Cuota NN/NN
const QUOTA_REGEX = /\b(\d{1,2})\/(\d{1,2})\b/;

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export async function parseStatementPdf(
  arrayBuffer: ArrayBuffer,
): Promise<ParsedStatementRow[]> {
  const buffer = Buffer.from(arrayBuffer);
  const result = await pdfParse(buffer);

  const normalized = normalizeText(result.text);
  const rows = parseFromText(normalized);

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Normalización                                                              */
/* -------------------------------------------------------------------------- */

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Reconstrucción de líneas lógicas                                           */
/* -------------------------------------------------------------------------- */

function parseFromText(text: string): ParsedStatementRow[] {
  const physicalLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const logicalLines: string[] = [];
  let current: string | null = null;

  for (const line of physicalLines) {
    if (DATE_IN_LINE_REGEX.test(line)) {
      // Nueva línea con fecha
      if (current) {
        logicalLines.push(current);
      }
      current = line;
    } else {
      // Continuación de la línea anterior
      if (current) {
        current += ' ' + line;
      }
    }
  }

  if (current) {
    logicalLines.push(current);
  }

  const rows: ParsedStatementRow[] = [];

  for (const logical of logicalLines) {
    let row: ParsedStatementRow | null = null;

    // 1) Consumo normal (fecha + *|K + descripción + importe)
    row = parseLine(logical);

    // 2) Si no es consumo normal, intentar impuesto de sellos
    if (!row && STAMP_DUTY_REGEX.test(logical)) {
      row = parseStampDutyLine(logical);
    }

    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

/* -------------------------------------------------------------------------- */
/* Parseo de una línea de consumo                                             */
/* -------------------------------------------------------------------------- */

function parseLine(line: string): ParsedStatementRow | null {
  const dateMatch = line.match(DATE_IN_LINE_REGEX);
  if (!dateMatch || dateMatch.index === undefined) return null;

  const [fullDate, dd, mm, yy] = dateMatch;
  const dateEndIndex = dateMatch.index + fullDate.length;

  const isoDate = toIsoDate(dd, mm, yy);
  if (!isoDate) return null;

  let rest = line.slice(dateEndIndex).trim();
  if (!rest) return null;

  // Filtrar explícitamente pagos tipo "SU PAGO EN ..."
  if (PAYMENT_LINE_REGEX.test(rest)) {
    return null;
  }

  // Marcador inicial "*" o "K" (si existe)
  const markerMatch = rest.match(/^\s*([*K])\s*/);
  if (markerMatch) {
    rest = rest.slice(markerMatch[0].length).trim();
  }

  // Recortar segmentos finales TOTAL / SALDO / RESUMEN / etc.
  rest = stripTrailingTotals(rest);
  if (!rest) return null;

  let installmentNumber: number | null = null;
  let installmentsTotal: number | null = null;
  let receipt: string | null = null;

  const quotaMatch = rest.match(QUOTA_REGEX);

  // -------------------------------------------------------------------------
  // Caso 1: línea con cuota NN/NN → tomar el PRIMER importe después de la cuota
  //         y del comprobante (6 dígitos).
  // -------------------------------------------------------------------------
  if (quotaMatch && quotaMatch.index !== undefined) {
    installmentNumber = Number(quotaMatch[1]);
    installmentsTotal = Number(quotaMatch[2]);

    const quotaStart = quotaMatch.index;
    const quotaEnd = quotaStart + quotaMatch[0].length;

    // Descripción: todo lo que está antes de la cuota
    const descBeforeQuota = rest.slice(0, quotaStart).trim();

    // Segmento después de la cuota
    let afterQuota = rest.slice(quotaEnd).trim();

    // Si lo primero después de la cuota son 6 dígitos → comprobante
    const receiptMatch = afterQuota.match(/^\s*(\d{6})\b/);
    if (receiptMatch && receiptMatch[1]) {
      receipt = receiptMatch[1];
      afterQuota = afterQuota.slice(receiptMatch[0].length).trim();
    }

    // En este segmento buscamos el PRIMER importe (no el último)
    const amountMatches = Array.from(afterQuota.matchAll(STRICT_AMOUNT_REGEX));
    if (amountMatches.length === 0) return null;

    const amountToken = amountMatches[0][0];
    const amount = parseArgAmount(amountToken);
    if (!Number.isFinite(amount)) return null;

    // Limpiar descripción (solo letras, números básicos, espacios, & y *)
    let description = descBeforeQuota.replace(
      /[^A-ZÁÉÍÓÚÜÑa-záéíóúüñ0-9&* +]/g,
      ' ',
    );
    description = description.replace(/\s{2,}/g, ' ').trim();

    if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(description)) {
      return null;
    }

    return {
      date: isoDate,
      description,
      amount,
      installmentNumber,
      installmentsTotal,
      receipt,
    };
  }

  // -------------------------------------------------------------------------
  // Caso 2: línea SIN cuota → usar el ÚLTIMO importe de la línea.
  // -------------------------------------------------------------------------
  const amountMatches = Array.from(rest.matchAll(STRICT_AMOUNT_REGEX));
  if (amountMatches.length === 0) {
    return null;
  }

  const lastMatch = amountMatches[amountMatches.length - 1];
  const amountToken = lastMatch[0];
  const amount = parseArgAmount(amountToken);
  if (!Number.isFinite(amount)) return null;

  // Descripción = resto sin el importe elegido
  let description = removeFirstOccurrence(rest, amountToken);
  description = description
    .replace(/[$€]|USD|U\$S/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(description)) {
    return null;
  }

  return {
    date: isoDate,
    description,
    amount,
    installmentNumber: null,
    installmentsTotal: null,
    receipt: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Impuesto de sellos (sin * ni K)                                            */
/* -------------------------------------------------------------------------- */

function parseStampDutyLine(line: string): ParsedStatementRow | null {
  const dateMatch = line.match(DATE_IN_LINE_REGEX);
  if (!dateMatch || dateMatch.index === undefined) return null;

  const [fullDate, dd, mm, yy] = dateMatch;
  const dateEndIndex = dateMatch.index + fullDate.length;

  const isoDate = toIsoDate(dd, mm, yy);
  if (!isoDate) return null;

  let rest = line.slice(dateEndIndex).trim();
  if (!rest) return null;

  if (!STAMP_DUTY_REGEX.test(rest)) {
    return null;
  }

  rest = stripTrailingTotals(rest);
  if (!rest) return null;

  const amountMatches = Array.from(rest.matchAll(STRICT_AMOUNT_REGEX));
  if (amountMatches.length === 0) {
    return null;
  }

  const lastMatch = amountMatches[amountMatches.length - 1];
  const amountToken = lastMatch[0];
  const amount = parseArgAmount(amountToken);
  if (!Number.isFinite(amount)) return null;

  let description = removeFirstOccurrence(rest, amountToken);
  description = description
    .replace(/[$€]|USD|U\$S/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(description)) {
    return null;
  }

  return {
    date: isoDate,
    description,
    amount,
    installmentNumber: null,
    installmentsTotal: null,
    receipt: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                 */
/* -------------------------------------------------------------------------- */

function stripTrailingTotals(rest: string): string {
  const upper = rest.toUpperCase();
  const idx = upper.search(TRAILING_TOTAL_REGEX);
  if (idx === -1) return rest;
  return rest.slice(0, idx).trim();
}

function toIsoDate(dd: string, mm: string, yy: string): string | null {
  let year = parseInt(yy, 10);
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  if (yy.length === 2) {
    if (year >= 70) {
      year += 1900;
    } else {
      year += 2000;
    }
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return (
    year.toString().padStart(4, '0') +
    '-' +
    month.toString().padStart(2, '0') +
    '-' +
    day.toString().padStart(2, '0')
  );
}

function parseArgAmount(token: string): number {
  let s = token.trim();
  let negative = false;

  // Signo al final: "1.234,56-"
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  }

  // Signo al inicio: "-1.234,56"
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }

  // Dejar solo dígitos, puntos y comas
  s = s.replace(/[^0-9.,]/g, '');
  s = s.replace(/\./g, '').replace(',', '.');

  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return NaN;

  return negative ? -n : n;
}

function removeFirstOccurrence(text: string, substr: string): string {
  const idx = text.indexOf(substr);
  if (idx === -1) return text;
  return text.slice(0, idx) + text.slice(idx + substr.length);
}
