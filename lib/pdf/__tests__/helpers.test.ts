import { describe, it, expect } from "vitest";
import {
  stripAccents,
  parseDateDDMMYY,
  toISODateFromSpanish,
  parseMoneyAR,
  normalizeDescription,
  normalizeForCompare,
  normalizeSpaces,
  detectInstallments,
  inferType,
  MONTHS_MAP,
} from "../helpers";

describe("stripAccents", () => {
  it("removes accents from Spanish text", () => {
    expect(stripAccents("áéíóú")).toBe("aeiou");
    expect(stripAccents("ÁÉÍÓÚ")).toBe("AEIOU");
    expect(stripAccents("ñ")).toBe("n");
    expect(stripAccents("Ñ")).toBe("N");
    expect(stripAccents("ü")).toBe("u");
  });

  it("keeps text without accents unchanged", () => {
    expect(stripAccents("hello")).toBe("hello");
    expect(stripAccents("MUNDO")).toBe("MUNDO");
  });
});

describe("parseDateDDMMYY", () => {
  it("parses DD-MM-YY format", () => {
    expect(parseDateDDMMYY("31-10-25")).toBe("2025-10-31");
    expect(parseDateDDMMYY("01-01-24")).toBe("2024-01-01");
    expect(parseDateDDMMYY("15-06-23")).toBe("2023-06-15");
  });

  it("parses DD.MM.YY format", () => {
    expect(parseDateDDMMYY("31.10.25")).toBe("2025-10-31");
    expect(parseDateDDMMYY("01.01.24")).toBe("2024-01-01");
  });

  it("handles edge cases", () => {
    expect(parseDateDDMMYY("28-02-24")).toBe("2024-02-28");
    expect(parseDateDDMMYY("29-02-24")).toBe("2024-02-29"); // leap year
  });
});

describe("toISODateFromSpanish", () => {
  it("parses Spanish date format", () => {
    expect(toISODateFromSpanish("31", "Octubre", "25")).toBe("2025-10-31");
    expect(toISODateFromSpanish("1", "Enero", "24")).toBe("2024-01-01");
    expect(toISODateFromSpanish("15", "Junio", "23")).toBe("2023-06-15");
  });

  it("handles accented month names", () => {
    expect(toISODateFromSpanish("26", "Febrero", "25")).toBe("2025-02-26");
  });

  it("handles 'setiembre' variant", () => {
    expect(toISODateFromSpanish("22", "Setiembre", "25")).toBe("2025-09-22");
    expect(toISODateFromSpanish("22", "Septiembre", "25")).toBe("2025-09-22");
  });

  it("is case insensitive", () => {
    expect(toISODateFromSpanish("31", "OCTUBRE", "25")).toBe("2025-10-31");
    expect(toISODateFromSpanish("31", "octubre", "25")).toBe("2025-10-31");
  });

  it("returns null for invalid dates", () => {
    expect(toISODateFromSpanish("32", "Octubre", "25")).toBeNull();
    expect(toISODateFromSpanish("0", "Octubre", "25")).toBeNull();
    expect(toISODateFromSpanish("31", "InvalidMonth", "25")).toBeNull();
    expect(toISODateFromSpanish("31", "Febrero", "25")).toBeNull(); // Feb 31 doesn't exist
  });

  it("handles year boundaries", () => {
    // Years 00-69 -> 2000-2069
    expect(toISODateFromSpanish("1", "Enero", "00")).toBe("2000-01-01");
    expect(toISODateFromSpanish("1", "Enero", "69")).toBe("2069-01-01");
    // Years 70-99 -> 1970-1999
    expect(toISODateFromSpanish("1", "Enero", "70")).toBe("1970-01-01");
    expect(toISODateFromSpanish("1", "Enero", "99")).toBe("1999-01-01");
  });
});

describe("parseMoneyAR", () => {
  it("parses Argentine money format", () => {
    expect(parseMoneyAR("1.234,56")).toBe(1234.56);
    expect(parseMoneyAR("123.456,78")).toBe(123456.78);
    expect(parseMoneyAR("1.234.567,89")).toBe(1234567.89);
  });

  it("parses amounts without thousands separator", () => {
    expect(parseMoneyAR("123,45")).toBe(123.45);
    expect(parseMoneyAR("0,00")).toBe(0);
  });

  it("handles negative amounts with trailing minus", () => {
    expect(parseMoneyAR("1.234,56-")).toBe(-1234.56);
    expect(parseMoneyAR("100,00-")).toBe(-100);
  });

  it("returns null for invalid input", () => {
    expect(parseMoneyAR("")).toBeNull();
    expect(parseMoneyAR("   ")).toBeNull();
    expect(parseMoneyAR("abc")).toBeNull();
  });

  it("handles real PDF values", () => {
    expect(parseMoneyAR("141.241,29")).toBe(141241.29);
    expect(parseMoneyAR("6.833,33")).toBe(6833.33);
    expect(parseMoneyAR("91333,33")).toBe(91333.33);
    expect(parseMoneyAR("20,00")).toBe(20);
  });
});

describe("normalizeDescription", () => {
  it("removes asterisks and numbers", () => {
    expect(normalizeDescription("MERPAGO*MERCADOLIBRE")).toBe("MERPAGO MERCADOLIBRE");
    expect(normalizeDescription("VIUMI *CHAPAS CANDELARIA")).toBe("VIUMI CHAPAS CANDELARIA");
  });

  it("removes special characters but keeps Spanish letters", () => {
    expect(normalizeDescription("CAFÉ & TÉ")).toBe("CAFÉ & TÉ");
    expect(normalizeDescription("PANADERÍA ÑOÑO")).toBe("PANADERÍA ÑOÑO");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeDescription("HELLO    WORLD")).toBe("HELLO WORLD");
  });

  it("handles real PDF descriptions", () => {
    expect(normalizeDescription("VIUMI *INDIGO")).toBe("VIUMI INDIGO");
    expect(normalizeDescription("MERPAGO*2PRODUCTOS")).toBe("MERPAGO PRODUCTOS");
    expect(normalizeDescription("OPENAI *CHATGPT")).toBe("OPENAI CHATGPT");
  });
});

describe("normalizeForCompare", () => {
  it("normalizes for comparison", () => {
    expect(normalizeForCompare("Su Pago en Pesos")).toBe("SU PAGO EN PESOS");
    expect(normalizeForCompare("  hello   world  ")).toBe("HELLO WORLD");
  });

  it("removes accents", () => {
    expect(normalizeForCompare("Café")).toBe("CAFE");
    expect(normalizeForCompare("Niño")).toBe("NINO");
  });
});

describe("normalizeSpaces", () => {
  it("collapses multiple spaces", () => {
    expect(normalizeSpaces("hello    world")).toBe("hello world");
    expect(normalizeSpaces("  trim  me  ")).toBe("trim me");
  });

  it("handles tabs and newlines", () => {
    expect(normalizeSpaces("hello\t\nworld")).toBe("hello world");
  });
});

describe("detectInstallments", () => {
  it("detects installments in C.XX/YY format", () => {
    const result = detectInstallments("COMERCIO C.05/12");
    expect(result.installment_number).toBe(5);
    expect(result.installments_total).toBe(12);
    expect(result.desc).toBe("COMERCIO");
  });

  it("detects installments in C XX/YY format (with space)", () => {
    const result = detectInstallments("COMERCIO C 05/12");
    expect(result.installment_number).toBe(5);
    expect(result.installments_total).toBe(12);
  });

  it("handles single digit installments", () => {
    const result = detectInstallments("COMPRA C.1/3");
    expect(result.installment_number).toBe(1);
    expect(result.installments_total).toBe(3);
  });

  it("returns nulls when no installments found", () => {
    const result = detectInstallments("COMPRA SIMPLE");
    expect(result.installment_number).toBeNull();
    expect(result.installments_total).toBeNull();
    expect(result.desc).toBe("COMPRA SIMPLE");
  });

  it("handles real PDF cases", () => {
    const result1 = detectInstallments("MERPAGO*MUNDOMAGICO C.01/02");
    expect(result1.installment_number).toBe(1);
    expect(result1.installments_total).toBe(2);

    const result2 = detectInstallments("GIRO DIDACTICO C.11/12");
    expect(result2.installment_number).toBe(11);
    expect(result2.installments_total).toBe(12);
  });
});

describe("inferType", () => {
  it("detects payments", () => {
    expect(inferType("SU PAGO EN PESOS")).toBe("payment");
    expect(inferType("SU PAGO EN USD")).toBe("payment");
  });

  it("detects fees and taxes", () => {
    expect(inferType("IMPUESTO DE SELLOS")).toBe("fee");
    expect(inferType("PERCEPCION RG")).toBe("fee");
    expect(inferType("IVA 21%")).toBe("fee");
    expect(inferType("COMISION POR ADELANTO")).toBe("fee");
    expect(inferType("CARGO ADMINISTRATIVO")).toBe("fee");
    expect(inferType("INTERES FINANCIERO")).toBe("fee");
  });

  it("defaults to expense", () => {
    expect(inferType("MERPAGO*MERCADOLIBRE")).toBe("expense");
    expect(inferType("SUPERMERCADO")).toBe("expense");
    expect(inferType("RESTAURANT")).toBe("expense");
  });
});

describe("MONTHS_MAP", () => {
  it("contains all 12 months", () => {
    expect(Object.keys(MONTHS_MAP).length).toBe(13); // 12 + setiembre variant
  });

  it("maps correctly", () => {
    expect(MONTHS_MAP["enero"]).toBe("01");
    expect(MONTHS_MAP["diciembre"]).toBe("12");
    expect(MONTHS_MAP["septiembre"]).toBe("09");
    expect(MONTHS_MAP["setiembre"]).toBe("09");
  });
});
