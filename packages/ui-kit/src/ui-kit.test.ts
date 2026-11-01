import { describe, expect, it } from 'vitest';
import { hello } from './index';

describe('ui-kit', () => {
  it('exports hello function', () => {
    expect(typeof hello).toBe('function');
  });

  it('hello returns expected string', () => {
    expect(hello()).toBe('UI Kit ready');
  });
});