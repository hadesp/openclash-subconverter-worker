// Parse complete numeric tokens: IP octets, ports, years and Mbps/Gbps are not multipliers.
// This expression is also RE2 compatible. Do not introduce lookaround.
export const HIGH_FILTER = '(?i)(高倍率|高倍|(^|[^0-9A-Za-z.])0*([2-9](\\.[0-9]+)?|[1-9][0-9]+(\\.[0-9]+)?)\\s*(x|倍)($|[^A-Za-z0-9.])|倍率\\s*[:：=]?\\s*0*([2-9](\\.[0-9]+)?|[1-9][0-9]+(\\.[0-9]+)?)($|[^0-9.]))';
const numeric = /(^|[^0-9A-Za-z.])([0-9]+(?:\.[0-9]+)?)\s*(x|倍)(?=$|[^A-Za-z0-9.])/gi;
const explicit = /倍率\s*[:：=]?\s*([0-9]+(?:\.[0-9]+)?)(?:\s*[xX倍])?(?=$|[^0-9.])/gi;
export function isHighMultiplier(name: string): boolean {
  if (/高倍率|高倍/.test(name)) return true;
  return [...name.matchAll(numeric)].some(m => Number(m[2]) >= 2)
    || [...name.matchAll(explicit)].some(m => Number(m[1]) >= 2);
}
