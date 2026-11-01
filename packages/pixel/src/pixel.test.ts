import { describe, expect, it } from 'vitest';
import { hello } from './index';

describe('pixel', () => {
  it('exports hello function', () => {
    expect(typeof hello).toBe('function');
  });

  it('hello returns expected string', () => {
    expect(hello()).toBe('Pixel visualizer ready');
  });
});