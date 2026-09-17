/** Exact, nonnegative counts and integer-cent arithmetic. Never clamp an unsafe value. */
export function assertNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer.`);
  }
  return value;
}

export function safeAdd(a: number, b: number, label = 'Total'): number {
  assertNonNegativeSafeInteger(a, label);
  assertNonNegativeSafeInteger(b, label);
  return assertNonNegativeSafeInteger(a + b, label);
}

export function safeMultiply(a: number, b: number, label = 'Line total'): number {
  assertNonNegativeSafeInteger(a, label);
  assertNonNegativeSafeInteger(b, label);
  return assertNonNegativeSafeInteger(a * b, label);
}

/** Round a nonnegative ratio half-up without losing cents in an intermediate product. */
export function roundedRatio(value: number, numerator: number, denominator: number): number {
  assertNonNegativeSafeInteger(value, 'Amount');
  assertNonNegativeSafeInteger(numerator, 'Numerator');
  assertNonNegativeSafeInteger(denominator, 'Denominator');
  if (denominator === 0) throw new RangeError('Denominator must be positive.');
  const product = BigInt(value) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const result = (product * BigInt(2) + divisor) / (divisor * BigInt(2));
  return assertNonNegativeSafeInteger(Number(result), 'Rounded amount');
}