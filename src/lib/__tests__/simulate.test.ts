import { describe, expect, it } from 'vitest';
import { simulate, attributeDenials, statsUpTo } from '../simulate';
import type { Consumer, SimEvent } from '../types';
import { SCENARIOS } from '../presets';

function oneConsumer(rps: number, tokensPerRequest: number, durationSec = 60): Consumer[] {
  return [
    {
      id: 'solo',
      name: 'Solo',
      description: 'test consumer',
      color: '#000',
      phases: [{ startSec: 0, endSec: durationSec, rps, tokensPerRequest }],
    },
  ];
}

describe('simulate', () => {
  it('allows all requests when demand is well under budget', () => {
    const result = simulate({
      durationSec: 60,
      budget: { rpm: 600, tpm: 600_000 },
      consumers: oneConsumer(1, 10, 60),
    });
    const denied = result.events.filter((e) => !e.allowed);
    expect(denied).toHaveLength(0);
  });

  it('denies for reason "rpm" once request count exceeds the per-minute cap, holding tpm high', () => {
    const result = simulate({
      durationSec: 60,
      budget: { rpm: 30, tpm: 10_000_000 },
      consumers: oneConsumer(1, 10, 60), // 60 requests/min demand against a 30 rpm budget
    });
    const denied = result.events.filter((e) => !e.allowed);
    expect(denied.length).toBeGreaterThan(0);
    expect(denied.every((e) => e.reason === 'rpm')).toBe(true);
  });

  it('denies for reason "tpm" when token cost per request is the binding constraint', () => {
    const result = simulate({
      durationSec: 60,
      budget: { rpm: 10_000, tpm: 6_000 }, // 100 tokens/sec allowed
      consumers: oneConsumer(1, 500, 60), // 500 tokens/sec demand, rpm is nowhere near its cap
    });
    const denied = result.events.filter((e) => !e.allowed);
    expect(denied.length).toBeGreaterThan(0);
    expect(denied.every((e) => e.reason === 'tpm')).toBe(true);
  });

  it('is deterministic: the same config produces byte-identical event traces', () => {
    const config = {
      durationSec: 90,
      budget: { rpm: 40, tpm: 20_000 },
      consumers: [
        ...oneConsumer(0.3, 300, 90),
        {
          id: 'burst',
          name: 'Burst',
          description: 'spikes mid-run',
          color: '#f00',
          phases: [
            { startSec: 0, endSec: 40, rps: 0.05, tokensPerRequest: 150 },
            { startSec: 40, endSec: 70, rps: 1.2, tokensPerRequest: 150 },
            { startSec: 70, endSec: 90, rps: 0.05, tokensPerRequest: 150 },
          ],
        },
      ],
    };
    const a = simulate(config);
    const b = simulate(config);
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('never lets bucket history go negative or above capacity', () => {
    const result = simulate({
      durationSec: 120,
      budget: { rpm: 20, tpm: 5_000 },
      consumers: oneConsumer(2, 400, 120),
    });
    for (const sample of result.bucketHistory) {
      expect(sample.requestTokensRemaining).toBeGreaterThanOrEqual(-1e-6);
      expect(sample.requestTokensRemaining).toBeLessThanOrEqual(sample.requestCapacity + 1e-6);
      expect(sample.tpmTokensRemaining).toBeGreaterThanOrEqual(-1e-6);
      expect(sample.tpmTokensRemaining).toBeLessThanOrEqual(sample.tpmCapacity + 1e-6);
    }
  });

  it('consumerStats sum of allowed+denied equals sent, for every consumer', () => {
    const result = simulate({
      durationSec: 90,
      budget: { rpm: 30, tpm: 15_000 },
      consumers: [...oneConsumer(0.5, 300, 90), ...oneConsumer(0.7, 300, 90).map((c) => ({ ...c, id: 'solo2' }))],
    });
    for (const stats of result.consumerStats) {
      expect(stats.allowed + stats.denied).toBe(stats.sent);
    }
  });
});

describe('attributeDenials', () => {
  it('blames the consumer that consumed the most in the lookback window, not the victim itself', () => {
    const events: SimEvent[] = [
      // culprit burns tokens right before the denial
      { tSec: 8, consumerId: 'culprit', tokens: 900, allowed: true },
      { tSec: 9, consumerId: 'culprit', tokens: 900, allowed: true },
      { tSec: 9, consumerId: 'victim', tokens: 100, allowed: true },
      { tSec: 10, consumerId: 'victim', tokens: 100, allowed: false, reason: 'tpm' },
    ];
    const attributions = attributeDenials(events, 5);
    expect(attributions).toHaveLength(1);
    expect(attributions[0].victimConsumerId).toBe('victim');
    expect(attributions[0].culpritConsumerId).toBe('culprit');
    expect(attributions[0].selfInflicted).toBe(false);
    expect(attributions[0].culpritShare).toBeCloseTo(1800 / 1900, 5);
  });

  it('marks a denial self-inflicted when the victim was also the dominant consumer', () => {
    const events: SimEvent[] = [
      { tSec: 5, consumerId: 'solo', tokens: 500, allowed: true },
      { tSec: 6, consumerId: 'solo', tokens: 500, allowed: false, reason: 'tpm' },
    ];
    const attributions = attributeDenials(events, 5);
    expect(attributions[0].selfInflicted).toBe(true);
    expect(attributions[0].culpritConsumerId).toBe('solo');
  });

  it('only looks back windowSec seconds, ignoring older usage', () => {
    const events: SimEvent[] = [
      { tSec: 0, consumerId: 'ancient', tokens: 5000, allowed: true },
      { tSec: 19, consumerId: 'recent', tokens: 100, allowed: true },
      { tSec: 20, consumerId: 'victim', tokens: 100, allowed: false, reason: 'tpm' },
    ];
    const attributions = attributeDenials(events, 5);
    expect(attributions[0].culpritConsumerId).toBe('recent');
  });

  it('returns no attributions when there are no denials', () => {
    const events: SimEvent[] = [{ tSec: 0, consumerId: 'a', tokens: 10, allowed: true }];
    expect(attributeDenials(events, 5)).toHaveLength(0);
  });
});

describe('statsUpTo', () => {
  const consumers = SCENARIOS[0].config.consumers;
  const result = simulate(SCENARIOS[0].config);

  it('counts nothing at t=-1 and everything at the end of the run', () => {
    const none = statsUpTo(result.events, consumers, -1);
    expect(none.every((s) => s.sent === 0 && s.denied === 0)).toBe(true);

    const all = statsUpTo(result.events, consumers, SCENARIOS[0].config.durationSec);
    for (const full of result.consumerStats) {
      const scoped = all.find((s) => s.consumerId === full.consumerId)!;
      expect(scoped).toEqual(full);
    }
  });

  it('never reports a denial before the attribution feed would show one', () => {
    // The W38 audit defect: the totals table was full-run while the feed beside
    // it was time-scoped, so the page showed 81 denials next to "No 429s yet".
    for (let t = 0; t < SCENARIOS[0].config.durationSec; t += 5) {
      const denied = statsUpTo(result.events, consumers, t).reduce((n, s) => n + s.denied, 0);
      const visible = result.attributions.filter((a) => a.tSec <= t).length;
      if (denied > 0) expect(visible).toBeGreaterThan(0);
    }
  });

  it('is monotonic in t', () => {
    let prev = 0;
    for (let t = 0; t <= SCENARIOS[0].config.durationSec; t += 10) {
      const sent = statsUpTo(result.events, consumers, t).reduce((n, s) => n + s.sent, 0);
      expect(sent).toBeGreaterThanOrEqual(prev);
      prev = sent;
    }
  });
});
