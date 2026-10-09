const UNITS_PER_TOKEN = 10_000_000n;
const AMOUNT_PATTERN = /^(\d{1,8})(?:\.(\d{1,7}))?$/;

export function decimalToUnits(value: string): bigint {
  const match = AMOUNT_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error('Amount must have up to 8 integer digits and 7 decimal places.');
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(7, '0') || '0');
  return whole * UNITS_PER_TOKEN + fraction;
}

export function unitsToDecimal(units: bigint): string {
  if (units < 0n) {
    throw new Error('Amount cannot be negative.');
  }

  const whole = units / UNITS_PER_TOKEN;
  const fraction = (units % UNITS_PER_TOKEN).toString().padStart(7, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
