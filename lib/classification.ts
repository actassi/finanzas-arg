import type { MerchantRule, MatchType } from '@/types/db';

// Resultado de la clasificación
export interface ClassificationResult {
  merchantName: string | null;
  categoryId: string | null;
  ruleId: string | null;
}

// Normaliza el texto de la descripción para facilitar los matches
export function normalizeDescription(raw: string): string {
  return raw
    .normalize('NFKD')                // separa letras de acentos
    .replace(/[\u0300-\u036f]/g, '')  // elimina los acentos
    .toUpperCase()
    .trim();
}

// Devuelve true si la regla matchea con la descripción normalizada
export function matchesRule(
  normalizedDescription: string,
  rule: MerchantRule
): boolean {
  const pattern = rule.pattern.toUpperCase().trim();

  if (!pattern) return false;

  switch (rule.match_type as MatchType) {
    case 'equals':
      return normalizedDescription === pattern;

    case 'starts_with':
      return normalizedDescription.startsWith(pattern);

    case 'ends_with':
      return normalizedDescription.endsWith(pattern);

    case 'contains':
    default:
      return normalizedDescription.includes(pattern);
  }
}

// Aplica las reglas de comercio a una descripción y devuelve el resultado
export function applyMerchantRules(
  descriptionRaw: string,
  rules: MerchantRule[]
): ClassificationResult {
  const normalized = normalizeDescription(descriptionRaw);

  // Si no hay descripción o no hay reglas, no se clasifica nada
  if (!normalized || rules.length === 0) {
    return {
      merchantName: null,
      categoryId: null,
      ruleId: null,
    };
  }

  // Ordenar las reglas por prioridad (número menor = se evalúa primero)
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  // Buscar la primera regla que matchee
  for (const rule of sortedRules) {
    if (matchesRule(normalized, rule)) {
      return {
        merchantName: rule.merchant_name || null,
        categoryId: rule.category_id || null,
        ruleId: rule.id,
      };
    }
  }

  // Si no matchea ninguna regla
  return {
    merchantName: null,
    categoryId: null,
    ruleId: null,
  };
}
