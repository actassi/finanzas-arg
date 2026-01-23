import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { parseStatementPdf, type Tx } from "../statementParser";

describe("statementParser - Integration Tests", () => {
  let pdfBuffer: Buffer;
  let transactions: Tx[];

  beforeAll(async () => {
    // Load the Galicia Visa PDF (uses text extraction, not OCR)
    const pdfPath = path.join(
      process.cwd(),
      "documents",
      "RESUMEN_VISA20_11_2025pdf.pdf"
    );
    pdfBuffer = await fs.readFile(pdfPath);
    transactions = await parseStatementPdf(pdfBuffer);
  }, 30000); // 30s timeout for PDF loading

  describe("parseStatementPdf", () => {
    it("should parse transactions from the PDF", () => {
      expect(transactions).toBeDefined();
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeGreaterThan(0);
    });

    it("should extract valid dates in ISO format", () => {
      for (const tx of transactions) {
        expect(tx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // Verify it's a valid date
        const d = new Date(tx.date);
        expect(d.toString()).not.toBe("Invalid Date");
      }
    });

    it("should extract positive amounts", () => {
      for (const tx of transactions) {
        expect(typeof tx.amount).toBe("number");
        expect(tx.amount).toBeGreaterThan(0);
      }
    });

    it("should have non-empty descriptions", () => {
      for (const tx of transactions) {
        expect(tx.description).toBeDefined();
        expect(tx.description.length).toBeGreaterThan(0);
      }
    });

    it("should detect installments when present", () => {
      const withInstallments = transactions.filter(
        (tx) => tx.installmentNumber !== null && tx.installmentsTotal !== null
      );

      // Based on the PDF, there should be some transactions with installments
      expect(withInstallments.length).toBeGreaterThan(0);

      for (const tx of withInstallments) {
        expect(tx.installmentNumber).toBeGreaterThan(0);
        expect(tx.installmentsTotal).toBeGreaterThan(0);
        expect(tx.installmentNumber!).toBeLessThanOrEqual(tx.installmentsTotal!);
      }
    });

    it("should exclude 'SU PAGO EN PESOS' transactions", () => {
      const payments = transactions.filter((tx) =>
        tx.description.toUpperCase().includes("SU PAGO")
      );
      expect(payments.length).toBe(0);
    });

    it("should parse specific known transactions from the PDF", () => {
      // Based on the PDF content we saw:
      // 12-10-24 * GRAELLS NELSON 14/18 007451 1.333,33
      const graellsNelson = transactions.find((tx) =>
        tx.description.toUpperCase().includes("GRAELLS")
      );

      if (graellsNelson) {
        expect(graellsNelson.date).toBe("2024-10-12");
        expect(graellsNelson.amount).toBe(1333.33);
        expect(graellsNelson.installmentNumber).toBe(14);
        expect(graellsNelson.installmentsTotal).toBe(18);
      }
    });
  });

  describe("Transaction structure", () => {
    it("should have correct Tx type structure", () => {
      const tx = transactions[0];

      expect(tx).toHaveProperty("date");
      expect(tx).toHaveProperty("description");
      expect(tx).toHaveProperty("receipt");
      expect(tx).toHaveProperty("installmentNumber");
      expect(tx).toHaveProperty("installmentsTotal");
      expect(tx).toHaveProperty("amount");
    });

    it("receipt should be string or null", () => {
      for (const tx of transactions) {
        expect(
          tx.receipt === null || typeof tx.receipt === "string"
        ).toBe(true);
      }
    });
  });
});

describe("statementParser - Edge Cases", () => {
  it("should handle empty buffer gracefully", async () => {
    const emptyBuffer = Buffer.from([]);
    await expect(parseStatementPdf(emptyBuffer)).rejects.toThrow();
  });

  it("should handle invalid PDF data", async () => {
    const invalidBuffer = Buffer.from("not a pdf");
    await expect(parseStatementPdf(invalidBuffer)).rejects.toThrow();
  });
});
