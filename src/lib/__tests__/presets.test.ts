import { describe, expect, it } from 'vitest';
import { SCENARIOS, getScenario } from '../presets';
import { simulate } from '../simulate';

describe('presets', () => {
  it('exposes exactly three scenarios with unique ids', () => {
    expect(SCENARIOS).toHaveLength(3);
    const ids = new Set(SCENARIOS.map((s) => s.id));
    expect(ids.size).toBe(3);
  });

  it('getScenario throws on an unknown id', () => {
    expect(() => getScenario('nope')).toThrow();
  });

  it('every scenario simulates without throwing and produces at least one denial', () => {
    for (const scenario of SCENARIOS) {
      const result = simulate(scenario.config);
      const denied = result.events.filter((e) => !e.allowed);
      expect(denied.length, `${scenario.id} should demonstrate at least one denial`).toBeGreaterThan(0);
    }
  });

  it('retry-storm: most denials are attributed to the fallback router, not the steady user app', () => {
    const scenario = getScenario('retry-storm');
    const result = simulate(scenario.config);
    const routerBlamed = result.attributions.filter((a) => a.culpritConsumerId === 'fallback-router').length;
    expect(routerBlamed).toBeGreaterThan(result.attributions.length / 2);
  });

  it('batch-collision: most denials are attributed to the batch job, not the daytime app', () => {
    const scenario = getScenario('batch-collision');
    const result = simulate(scenario.config);
    const batchBlamed = result.attributions.filter((a) => a.culpritConsumerId === 'batch-job').length;
    expect(batchBlamed).toBeGreaterThan(result.attributions.length / 2);
  });

  it('every scenario has at least one denial attributed to a consumer other than the victim (the whole point)', () => {
    for (const scenario of SCENARIOS) {
      const result = simulate(scenario.config);
      const crossBlame = result.attributions.some((a) => !a.selfInflicted);
      expect(crossBlame, `${scenario.id} should show at least one cross-consumer denial`).toBe(true);
    }
  });
});
