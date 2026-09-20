/**
 * One phase of a consumer's traffic: a rate (requests/second) and a token
 * cost per request, active for [startSec, endSec). A consumer is a list of
 * phases so it can go quiet, spike and resume.
 */
export interface Phase {
  startSec: number;
  endSec: number;
  /** requests per second during this phase (fractional is fine — 0.2 = 1 every 5s) */
  rps: number;
  tokensPerRequest: number;
}

export interface Consumer {
  id: string;
  name: string;
  /** short label for what this consumer represents, shown in the UI */
  description: string;
  color: string;
  phases: Phase[];
}

export interface KeyBudget {
  /** requests allowed per minute, refilled continuously */
  rpm: number;
  /** tokens allowed per minute, refilled continuously */
  tpm: number;
}

export interface SimEvent {
  tSec: number;
  consumerId: string;
  tokens: number;
  allowed: boolean;
  /** which bucket ran out, when denied */
  reason?: 'rpm' | 'tpm';
}

export interface BucketSample {
  tSec: number;
  requestTokensRemaining: number;
  requestCapacity: number;
  tpmTokensRemaining: number;
  tpmCapacity: number;
}

export interface ConsumerStats {
  consumerId: string;
  sent: number;
  allowed: number;
  denied: number;
  tokensConsumed: number;
}

export interface Attribution {
  /** the denied event this attribution explains */
  tSec: number;
  victimConsumerId: string;
  /** consumer that consumed the largest share of the budget in the preceding window */
  culpritConsumerId: string;
  culpritShare: number;
  selfInflicted: boolean;
  windowSec: number;
}

export interface SimConfig {
  durationSec: number;
  budget: KeyBudget;
  consumers: Consumer[];
  /** lookback window used to attribute a denial to whoever was consuming the most, in seconds */
  attributionWindowSec?: number;
}

export interface SimResult {
  events: SimEvent[];
  bucketHistory: BucketSample[];
  consumerStats: ConsumerStats[];
  attributions: Attribution[];
}

export interface Scenario {
  id: string;
  name: string;
  tagline: string;
  source?: string;
  config: SimConfig;
}
