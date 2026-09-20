import type { Scenario } from './types';

/**
 * Three synthetic scenarios. The numbers are illustrative, not pulled from
 * any real provider dashboard — nothing here calls a real API or reads a
 * real quota. What is real is the shape: a fallback router that retries
 * without knowing who else is on the key, a batch job scheduled by a
 * calendar that doesn't know about traffic, and a shared service-account key
 * three teams quietly agreed to "just use for now." All three predate this
 * build; what changed in the week of 8–14 Sep 2026 is the margin for error —
 * see the README for the reporting this rides.
 */

const RETRY_STORM: Scenario = {
  id: 'retry-storm',
  name: 'Retry Storm',
  tagline: 'A downstream timeout makes your own fallback router the attacker.',
  config: {
    durationSec: 180,
    budget: { rpm: 60, tpm: 40_000 },
    attributionWindowSec: 5,
    consumers: [
      {
        id: 'user-app',
        name: 'User-facing app',
        description: 'Steady real traffic. Nothing about it changes all run.',
        color: '#4f8cff',
        phases: [{ startSec: 0, endSec: 180, rps: 0.35, tokensPerRequest: 350 }],
      },
      {
        id: 'fallback-router',
        name: 'Fallback router',
        description: 'Normally near-idle. Sees a downstream timeout at 0:60 and retries hard for 90s.',
        color: '#ff6b6b',
        phases: [
          { startSec: 0, endSec: 60, rps: 0.05, tokensPerRequest: 200 },
          { startSec: 60, endSec: 150, rps: 2.2, tokensPerRequest: 200 },
          { startSec: 150, endSec: 180, rps: 0.05, tokensPerRequest: 200 },
        ],
      },
    ],
  },
};

const BATCH_WINDOW_COLLISION: Scenario = {
  id: 'batch-collision',
  name: 'Batch Window Collision',
  tagline: 'The backfill job was scheduled off a calendar that has never heard of your traffic.',
  config: {
    durationSec: 180,
    budget: { rpm: 60, tpm: 40_000 },
    attributionWindowSec: 5,
    consumers: [
      {
        id: 'batch-job',
        name: 'Nightly batch job',
        description: '"Nightly" in a timezone nobody double-checked. Large per-request token cost.',
        color: '#ffb020',
        phases: [{ startSec: 40, endSec: 160, rps: 0.5, tokensPerRequest: 2200 }],
      },
      {
        id: 'user-app',
        name: 'User-facing app',
        description: 'Daytime traffic, on the same schedule as the batch job\'s requests by coincidence.',
        color: '#4f8cff',
        phases: [{ startSec: 0, endSec: 180, rps: 0.5, tokensPerRequest: 300 }],
      },
    ],
  },
};

const SHARED_SERVICE_KEY: Scenario = {
  id: 'shared-service-key',
  name: 'Shared Service-Account Key',
  tagline: 'Three teams, one deployment key, because nobody wanted to file the quota-increase ticket.',
  config: {
    durationSec: 180,
    budget: { rpm: 45, tpm: 30_000 },
    attributionWindowSec: 5,
    consumers: [
      {
        id: 'analytics-job',
        name: 'Internal analytics job',
        description: 'A different team\'s dashboard refresh. Nobody on the paged team knows it exists.',
        color: '#ffb020',
        phases: [{ startSec: 0, endSec: 180, rps: 0.28, tokensPerRequest: 3000 }],
      },
      {
        id: 'user-app',
        name: 'User-facing app',
        description: 'The team that will get the page.',
        color: '#4f8cff',
        phases: [{ startSec: 0, endSec: 180, rps: 0.3, tokensPerRequest: 320 }],
      },
      {
        id: 'health-check',
        name: 'Health-check pinger',
        description: 'Tiny and constant. Easy to forget it is on the same key.',
        color: '#7bd88f',
        phases: [{ startSec: 0, endSec: 180, rps: 0.28, tokensPerRequest: 40 }],
      },
    ],
  },
};

export const SCENARIOS: Scenario[] = [RETRY_STORM, BATCH_WINDOW_COLLISION, SHARED_SERVICE_KEY];

export function getScenario(id: string): Scenario {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown scenario: ${id}`);
  return found;
}
