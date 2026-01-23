/**
 * Funciones helper para parsing de PDFs de extractos bancarios.
 * Exportadas para testing y reutilización.
 */

// Mapeo de meses en español a número
export const MONTHS_MAP: Record<string, string> = {
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

/**
 * Normaliza texto removiendo acentos
 */
export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Parsea fecha en formato DD-MM-YY o DD.MM.YY a ISO (YYYY-MM-DD)
 */
export function parseDateDDMMYY(s: string): string {
  const norm = s.replace(/\./g, "-");
  const [dd, mm, yy] = norm.split("-").map(Number);
  const yyyy = 2000 + yy;
  return new Date(Date.UTC(yyyy, mm - 1, dd)).toISOString().slice(0, 10);
}

/**
 * Parsea fecha en español (ej: "31", "Octubre", "25") a ISO (YYYY-MM-DD)
 * Retorna null si la fecha es inválida
 */
export function toISODateFromSpanish(
  d: string,
  month: string,
  yy: string
): string | null {
  const dayNum = Number(d);
  if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) return null;

  const dd = String(dayNum).padStart(2, "0");
  const mKey = stripAccents(month.trim().toLowerCase());
  const mm = MONTHS_MAP[mKey];
  if (!mm) return null;

  const y2 = Number(yy);
  if (!Number.isFinite(y2) || y2 < 0 || y2 > 99) return null;

  const yyyy = y2 <= 69 ? 2000 + y2 : 1900 + y2;

  // Validar que la fecha sea válida
  const testDate = new Date(yyyy, Number(mm) - 1, dayNum);
  if (testDate.getMonth() !== Number(mm) - 1 || testDate.getDate() !== dayNum) {
    return null;
  }

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parsea monto en formato argentino (123.456,78) a número
 */
export function parseMoneyAR(s: string): number | null {
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

/**
 * Normaliza descripción removiendo caracteres especiales y números
 */
export function normalizeDescription(raw: string): string {
  return raw
    .replace(/[*]/g, " ")
    .replace(/[0-9]/g, " ")
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza texto para comparación (sin tildes, mayúsculas, espacios colapsados)
 */
export function normalizeForCompare(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Normaliza espacios múltiples a uno solo
 */
export function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Detecta cuotas en formato "C.02/12" o "C 02/12"
 */
export function detectInstallments(desc: string): {
  desc: string;
  installment_number: number | null;
  installments_total: number | null;
} {
  const m = desc.match(/\bC\.?\s*(\d{1,2})\s*\/\s*(\d{1,2})\b/i);
  if (!m) {
    return {
      desc,
      installment_number: null,
      installments_total: null,
    };
  }

  const n = Number(m[1]);
  const t = Number(m[2]);

  const cleaned = normalizeSpaces(desc.replace(m[0], "").replace(/\(\s*\)/g, ""));
  return {
    desc: cleaned,
    installment_number: Number.isFinite(n) ? n : null,
    installments_total: Number.isFinite(t) ? t : null,
  };
}

/**
 * Infiere el tipo de transacción basándose en la descripción
 */
export function inferType(
  descUpper: string
): "expense" | "payment" | "fee" | "income" | "transfer" | "other" {
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
