/** Detecta marcadores completos, sin confundir títulos como Demolition. */
export function hasDemoMarker(value: string): boolean {
  return /(?:^|[^\p{L}\p{N}])(?:demo|демо|демонстрационная версия)(?=$|[^\p{L}\p{N}])|体験版/iu.test(value);
}
