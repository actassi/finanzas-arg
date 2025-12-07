// lib/pdf/statementParser.ts
import pdfParse from 'pdf-parse';

export interface ParsedStatementRow {
  date: string;        // Fecha en formato ISO: YYYY-MM-DD
  description: string; // Descripción cruda del movimiento
  amount: number;      // Monto numérico (positivo = débito, negativo = crédito)
}

/**
 * Parser principal para resúmenes bancarios / tarjetas.
 * Recibe el ArrayBuffer del PDF (File.arrayBuffer()).
 */
export async function parseStatementPdf(
  fileBuffer: ArrayBuffer
): Promise<ParsedStatementRow[]> {
  // pdf-parse v1 trabaja con Buffer de Node
  const buffer = Buffer.from(fileBuffer);

  const result = await pdfParse(buffer);
  const rawText = result.text ?? '';

  // Normalizamos saltos de línea por las dudas
  const text = rawText.replace(/\r\n/g, '\n');

  const rows = parseFromText(text);

  // Log de depuración (lo podés comentar cuando esté estable)
  console.log('[PDF parser] filas encontradas:', rows.length);
  console.log('[PDF parser] primeras filas:', rows.slice(0, 5));

  return rows;
}

/**
 * Parser “por tramos de fecha”:
 *  - Busca todas las apariciones de una fecha corta DD.MM.AA o DD-MM-AA
 *  - Para cada fecha, toma el fragmento de texto hasta la siguiente fecha
 *  - Dentro de ese tramo:
 *      * quita espacios sobrantes
 *      * usa la ÚLTIMA “palabra numérica” como importe
 *      * el resto es la descripción
 */
function parseFromText(text: string): ParsedStatementRow[] {
  const rows: ParsedStatementRow[] = [];

  const dateRegex = /(\d{2}[.\-]\d{2}[.\-]\d{2})/g;
  const matches = Array.from(text.matchAll(dateRegex));

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index ?? 0;
    const end =
      i + 1 < matches.length
        ? matches[i + 1].index ?? text.length
        : text.length;

    const chunk = text.slice(start, end);

    // Compactamos espacios
    const line = chunk.replace(/\s+/g, ' ').trim();
    const dateStr = match[1];

    const isoDate = parseShortDateToIso(dateStr);
    if (!isoDate) continue;

    // Restante después de la fecha
    const rest = line.slice(match[0].length).trim();
    if (!rest) continue;

    // Filtramos bloques claramente de totales / encabezados
    if (
      /(TOTAL\s|SALDO ANTERIOR|PAGO ANTERIOR|L[ÍI]MITE|VENCIMIENTO)/i.test(
        rest
      )
    ) {
      continue;
    }

    // Último bloque numérico como importe.
    // Ejemplos que matchea:
    //  - 17.272,33
    //  - -1.289.017,13
    //  - 17272,33
    //  - 20.000
    const numMatch = rest.match(
      /(-?\d[\d\.\,]*)(?:\s*[A-Z$]{0,5})?\s*$/
    );
    if (!numMatch) continue;

    const amountToken = numMatch[1];
    const amount = parseAmount(amountToken);
    if (Number.isNaN(amount)) continue;

    // Descripción: todo lo anterior al bloque numérico final
    const description = rest
      .slice(0, rest.length - numMatch[0].length)
      .trim();

    // Debe contener al menos una letra (evita capturar solo números sueltos)
    if (!/[A-Za-zÁÉÍÓÚÑ]/.test(description)) continue;

    rows.push({
      date: isoDate,
      description,
      amount,
    });
  }

  return rows;
}

/**
 * Convierte "DD.MM.AA" o "DD-MM-AA" en "YYYY-MM-DD".
 */
function parseShortDateToIso(dateStr: string): string | null {
  const m = dateStr.match(/^(\d{2})[.\-](\d{2})[.\-](\d{2})$/);
  if (!m) return null;

  const [, dd, mm, yy] = m;

  const yearShort = Number(yy);
  const fullYear = yearShort >= 70 ? 1900 + yearShort : 2000 + yearShort;

  return `${fullYear}-${mm}-${dd}`;
}

/**
 * Convierte cosas como:
 *  - "14.590,00"   -> 14590
 *  - "1.333,33C"   -> 1333.33
 *  - "-2.500,00D"  -> -2500
 *  - "20.000"      -> 20000
 */
function parseAmount(token: string): number {
  let s = token.trim();
  if (!s) return Number.NaN;

  // Nos quedamos sólo con dígitos, puntos, comas y signo
  s = s.replace(/[^\d,\.\-]/g, '');
  // Quitamos separadores de miles y usamos punto decimal
  s = s.replace(/\./g, '').replace(',', '.');

  return Number.parseFloat(s);
}
