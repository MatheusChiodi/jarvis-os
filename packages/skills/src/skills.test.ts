import { describe, expect, it } from 'vitest';
import { hello } from './index';

describe('skills', () => {
  it('exports hello function', () => {
    expect(typeof hello).toBe('function');
  });

  it('hello returns expected string', () => {
    expect(hello()).toBe('Skills registry ready');
  });
});