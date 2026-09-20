import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../bucket';

describe('TokenBucket', () => {
  it('starts full and allows exactly `capacity` consumes at t=0', () => {
    const bucket = new TokenBucket(5);
    for (let i = 0; i < 5; i++) {
      expect(bucket.tryConsume(0, 1)).toBe(true);
    }
    expect(bucket.tryConsume(0, 1)).toBe(false);
  });

  it('refills continuously at capacity/60 tokens per second', () => {
    const bucket = new TokenBucket(60); // 1 token/sec
    for (let i = 0; i < 60; i++) bucket.tryConsume(0, 1);
    expect(bucket.tryConsume(0, 1)).toBe(false);
    // 10 seconds later, ~10 tokens should have refilled; consuming 1 leaves 9
    expect(bucket.tryConsume(10, 1)).toBe(true);
    expect(bucket.remaining(10)).toBeCloseTo(9, 5);
  });

  it('never exceeds capacity even after a long idle period', () => {
    const bucket = new TokenBucket(10);
    expect(bucket.remaining(10_000)).toBe(10);
  });

  it('denies a request that costs more than what is currently available, without deducting anything', () => {
    const bucket = new TokenBucket(10);
    bucket.tryConsume(0, 8);
    expect(bucket.remaining(0)).toBeCloseTo(2, 5);
    expect(bucket.tryConsume(0, 5)).toBe(false);
    // nothing was deducted by the failed attempt
    expect(bucket.remaining(0)).toBeCloseTo(2, 5);
  });

  it('can start empty', () => {
    const bucket = new TokenBucket(60, false);
    expect(bucket.tryConsume(0, 1)).toBe(false);
    expect(bucket.tryConsume(1, 1)).toBe(true);
  });
});
