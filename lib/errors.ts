/**
 * Utilidades para manejo seguro de errores.
 *
 * Los errores de base de datos pueden contener información sensible
 * (nombres de tablas, constraints, esquema). Esta utilidad:
 * 1. Loguea el error completo server-side para debugging
 * 2. Retorna un mensaje genérico al cliente
 */

type PostgrestError = {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
};

// Mapeo de códigos de error PostgreSQL a mensajes amigables
const ERROR_CODE_MESSAGES: Record<string, string> = {
  "23505": "Ya existe un registro con esos datos.",
  "23503": "No se puede realizar la operación: hay datos relacionados.",
  "23502": "Faltan campos obligatorios.",
  "22001": "Uno de los campos excede el límite de caracteres.",
  "22008": "Fecha inválida.",
  "22P02": "Formato de datos inválido.",
  "42501": "No tenés permisos para realizar esta operación.",
  "42P01": "Error interno de configuración.",
  "PGRST301": "El registro no existe o no tenés acceso.",
};

/**
 * Convierte un error de Supabase/PostgreSQL en un mensaje seguro para el usuario.
 * Loguea el error completo en el servidor.
 */
export function sanitizeDbError(
  error: PostgrestError | Error | unknown,
  context?: string
): string {
  // Log completo server-side
  console.error(`[DB Error]${context ? ` ${context}:` : ""}`, error);

  if (!error) {
    return "Ocurrió un error inesperado.";
  }

  // Si es un error de Postgrest/Supabase
  if (typeof error === "object" && error !== null) {
    const pgError = error as PostgrestError;

    // Verificar si hay un código conocido
    if (pgError.code && ERROR_CODE_MESSAGES[pgError.code]) {
      return ERROR_CODE_MESSAGES[pgError.code];
    }

    // Para errores de conexión o timeout
    if (pgError.message?.includes("timeout")) {
      return "La operación tardó demasiado. Intentá de nuevo.";
    }

    if (pgError.message?.includes("network") || pgError.message?.includes("fetch")) {
      return "Error de conexión. Verificá tu conexión a internet.";
    }
  }

  // Mensaje genérico por defecto
  return "No se pudo completar la operación. Intentá de nuevo.";
}

/**
 * Variante que permite pasar un mensaje personalizado para código 23505 (unique violation)
 */
export function sanitizeDbErrorWithDuplicate(
  error: PostgrestError | Error | unknown,
  duplicateMessage: string,
  context?: string
): string {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as PostgrestError).code === "23505"
  ) {
    console.error(`[DB Error]${context ? ` ${context}:` : ""}`, error);
    return duplicateMessage;
  }

  return sanitizeDbError(error, context);
}
