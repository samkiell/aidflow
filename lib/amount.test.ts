import { describe, expect, it } from 'vitest';
import { decimalToUnits, unitsToDecimal } from './amount';

describe('decimal amount arithmetic', () => {
  it('converts seven-decimal amounts to exact integer units', () => {
    expect(decimalToUnits('12.3400001')).toBe(123_400_001n);
    expect(decimalToUnits('0.0000001')).toBe(1n);
    expect(unitsToDecimal(123_400_001n)).toBe('12.3400001');
    expect(unitsToDecimal(120_000_000n)).toBe('12');
  });

  it('rejects amounts beyond the supported precision and range', () => {
    expect(() => decimalToUnits('1.00000001')).toThrow();
    expect(() => decimalToUnits('100000000.00')).toThrow();
    expect(() => decimalToUnits('-1')).toThrow();
  });
});
