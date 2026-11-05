// Only fixed, non-sensitive error codes may cross the HTTP boundary.
export class ConversionError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export function requireValue(condition: unknown, code: string): asserts condition {
  if (!condition) throw new ConversionError(code);
}
