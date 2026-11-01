import { describe, expect, it } from 'vitest';
import { getOrCreateToken, validateToken } from './config';

describe('daemon config', () => {
  describe('getOrCreateToken', () => {
    it('creates new token when none exists', () => {
      const token = getOrCreateToken();
      expect(token).toBeDefined();
      expect(token.length).toBe(64);
    });

    it('returns existing token from file', () => {
      const token1 = getOrCreateToken();
      const token2 = getOrCreateToken();
      expect(token1).toBe(token2);
    });
  });

  describe('validateToken', () => {
    it('validates correct token', () => {
      const token = getOrCreateToken();
      expect(validateToken(token)).toBe(true);
    });

    it('rejects incorrect token', () => {
      getOrCreateToken();
      expect(validateToken('wrong-token')).toBe(false);
    });
  });
});