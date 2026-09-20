/**
 * A continuous token bucket: capacity refills at `ratePerSec` tokens/second,
 * capped at `capacity`. This is the standard algorithm every major LLM
 * provider documents for its RPM/TPM limits (Azure OpenAI, OpenAI, Anthropic).
 */
export class TokenBucket {
  readonly capacity: number;
  private tokens: number;
  private readonly ratePerSec: number;
  private lastTSec: number;

  constructor(capacityPerMinute: number, startFull = true) {
    this.capacity = capacityPerMinute;
    this.ratePerSec = capacityPerMinute / 60;
    this.tokens = startFull ? capacityPerMinute : 0;
    this.lastTSec = 0;
  }

  private refillTo(tSec: number): void {
    const elapsed = Math.max(0, tSec - this.lastTSec);
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.ratePerSec);
    this.lastTSec = tSec;
  }

  /** Returns true and deducts `amount` if available; false and deducts nothing otherwise. */
  tryConsume(tSec: number, amount: number): boolean {
    this.refillTo(tSec);
    if (this.tokens + 1e-9 >= amount) {
      this.tokens -= amount;
      return true;
    }
    return false;
  }

  remaining(tSec: number): number {
    this.refillTo(tSec);
    return this.tokens;
  }
}
