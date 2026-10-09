import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './auth';

describe('password hashing', () => {
  it('stores a salted hash and verifies the original password', async () => {
    const password = 'correct-horse-battery-staple';
    const hash = await hashPassword(password);

    expect(hash).not.toContain(password);
    expect(hash.split('$')).toHaveLength(3);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password and malformed hashes', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');

    await expect(verifyPassword('incorrect-password', hash)).resolves.toBe(false);
    await expect(verifyPassword('anything', 'not-a-scrypt-hash')).resolves.toBe(false);
  });
});
