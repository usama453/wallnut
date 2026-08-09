/**
 * Replace unpaired UTF-16 surrogates with U+FFFD so strings always serialize
 * to valid JSON (a lone surrogate escaped as \udXXX is rejected by
 * PostgREST/Aeson with PGRST102 "Empty or invalid json", failing the save).
 */
export function sanitizeText(value: string): string {
  return value.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}
