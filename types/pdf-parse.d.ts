// src/types/pdf-parse.d.ts

declare module 'pdf-parse' {
  /** Resultado mínimo que necesitamos de pdf-parse */
  interface PDFParseResult {
    text?: string;
    // El resto de propiedades no nos interesa tiparlas por ahora
    [key: string]: unknown;
  }

  /**
   * Función principal de pdf-parse v1.x
   */
  function pdfParse(
    data: Buffer | Uint8Array | ArrayBuffer
  ): Promise<PDFParseResult>;

  // La librería es CommonJS export = function
  export = pdfParse;
}
