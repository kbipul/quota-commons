import { TokenBucket } from './bucket';
import type {
  Attribution,
  BucketSample,
  Consumer,
  ConsumerStats,
  SimConfig,
  SimEvent,
  SimResult,
} from './types';

function rpsAt(consumer: Consumer, tSec: number): { rps: number; tokensPerRequest: number } {
  for (const phase of consumer.phases) {
    if (tSec >= phase.startSec && tSec < phase.endSec) {
      return { rps: phase.rps, tokensPerRequest: phase.tokensPerRequest };
    }
  }
  return { rps: 0, tokensPerRequest: 0 };
}

/**
 * Deterministic discrete-time simulation, one tick per second. Each consumer
 * accumulates fractional request counts (a "carry") from its current phase's
 * rps and fires whole requests when the carry crosses 1 — no randomness, so
 * the same config always produces the same trace. Within a tick, consumers
 * are offered to the shared buckets in the order they were declared: nothing
 * in a real shared API key coordinates who goes first either, and that
 * declaration-order tie-break IS the mechanism this tool is about.
 */
export function simulate(config: SimConfig): SimResult {
  const { durationSec, budget, consumers } = config;
  const attributionWindowSec = config.attributionWindowSec ?? 5;

  const requestBucket = new TokenBucket(budget.rpm);
  const tpmBucket = new TokenBucket(budget.tpm);

  const carry = new Map<string, number>(consumers.map((c) => [c.id, 0]));
  const events: SimEvent[] = [];
  const bucketHistory: BucketSample[] = [];
  const statsMap = new Map<string, ConsumerStats>(
    consumers.map((c) => [c.id, { consumerId: c.id, sent: 0, allowed: 0, denied: 0, tokensConsumed: 0 }]),
  );

  for (let t = 0; t < durationSec; t++) {
    for (const consumer of consumers) {
      const { rps, tokensPerRequest } = rpsAt(consumer, t);
      const c = (carry.get(consumer.id) ?? 0) + rps;
      let fireCount = Math.floor(c);
      carry.set(consumer.id, c - fireCount);

      while (fireCount > 0) {
        fireCount--;
        const stats = statsMap.get(consumer.id)!;
        stats.sent++;

        const gotRequestSlot = requestBucket.tryConsume(t, 1);
        if (!gotRequestSlot) {
          stats.denied++;
          events.push({ tSec: t, consumerId: consumer.id, tokens: tokensPerRequest, allowed: false, reason: 'rpm' });
          continue;
        }
        const gotTokens = tpmBucket.tryConsume(t, tokensPerRequest);
        if (!gotTokens) {
          stats.denied++;
          events.push({ tSec: t, consumerId: consumer.id, tokens: tokensPerRequest, allowed: false, reason: 'tpm' });
          continue;
        }
        stats.allowed++;
        stats.tokensConsumed += tokensPerRequest;
        events.push({ tSec: t, consumerId: consumer.id, tokens: tokensPerRequest, allowed: true });
      }
    }

    bucketHistory.push({
      tSec: t,
      requestTokensRemaining: requestBucket.remaining(t),
      requestCapacity: requestBucket.capacity,
      tpmTokensRemaining: tpmBucket.remaining(t),
      tpmCapacity: tpmBucket.capacity,
    });
  }

  const attributions = attributeDenials(events, attributionWindowSec);

  return {
    events,
    bucketHistory,
    consumerStats: Array.from(statsMap.values()),
    attributions,
  };
}

/**
 * Consumer totals restricted to the events at or before `tSec`.
 *
 * The full-run totals in `SimResult.consumerStats` answer "what did the whole
 * three minutes cost each consumer". The table next to the attribution feed
 * has to answer a different question -- what the run looks like from where the
 * scrubber is standing -- or it contradicts the feed beside it, which is
 * time-scoped. (W38 audit: the committed screenshot showed 81 denials next to
 * "No 429s yet at this point in the run.")
 */
export function statsUpTo(
  events: SimEvent[],
  consumers: Consumer[],
  tSec: number,
): ConsumerStats[] {
  const map = new Map<string, ConsumerStats>(
    consumers.map((c) => [c.id, { consumerId: c.id, sent: 0, allowed: 0, denied: 0, tokensConsumed: 0 }]),
  );
  for (const e of events) {
    if (e.tSec > tSec) continue;
    const s = map.get(e.consumerId);
    if (!s) continue;
    s.sent++;
    if (e.allowed) {
      s.allowed++;
      s.tokensConsumed += e.tokens;
    } else {
      s.denied++;
    }
  }
  return Array.from(map.values());
}

/**
 * For every denied event, look back `windowSec` seconds and find which
 * consumer consumed the largest share of ALLOWED token volume in that
 * window. That consumer is the "culprit" the victim's own dashboard cannot
 * see — the victim only knows its own request failed.
 */
export function attributeDenials(events: SimEvent[], windowSec: number): Attribution[] {
  const attributions: Attribution[] = [];
  for (const event of events) {
    if (event.allowed) continue;
    const windowStart = event.tSec - windowSec;
    const usageByConsumer = new Map<string, number>();
    let totalTokens = 0;
    for (const e of events) {
      if (!e.allowed) continue;
      if (e.tSec < windowStart || e.tSec > event.tSec) continue;
      usageByConsumer.set(e.consumerId, (usageByConsumer.get(e.consumerId) ?? 0) + e.tokens);
      totalTokens += e.tokens;
    }
    let culpritConsumerId = event.consumerId;
    let culpritTokens = 0;
    for (const [id, tokens] of usageByConsumer) {
      if (tokens > culpritTokens) {
        culpritTokens = tokens;
        culpritConsumerId = id;
      }
    }
    const culpritShare = totalTokens > 0 ? culpritTokens / totalTokens : 0;
    attributions.push({
      tSec: event.tSec,
      victimConsumerId: event.consumerId,
      culpritConsumerId,
      culpritShare,
      selfInflicted: culpritConsumerId === event.consumerId,
      windowSec,
    });
  }
  return attributions;
}

export { rpsAt as _rpsAt };
