import type { Attribution, Consumer } from '../lib/types';
import { formatClock, formatPct } from '../lib/format';

interface Props {
  attributions: Attribution[];
  consumers: Consumer[];
  currentT: number;
}

function nameFor(consumers: Consumer[], id: string): string {
  return consumers.find((c) => c.id === id)?.name ?? id;
}

export function AttributionFeed({ attributions, consumers, currentT }: Props) {
  const visible = attributions.filter((a) => a.tSec <= currentT).slice(-6).reverse();

  if (visible.length === 0) {
    return <div className="attribution-empty">No 429s yet at this point in the run.</div>;
  }

  return (
    <ul className="attribution-feed">
      {visible.map((a, i) => (
        <li key={i} className={a.selfInflicted ? 'attribution-self' : 'attribution-other'}>
          <div className="attribution-time">{formatClock(a.tSec)}</div>
          <div>
            <div className="attribution-line">
              <strong>What {nameFor(consumers, a.victimConsumerId)} sees:</strong> a 429, and nothing else.
            </div>
            {a.selfInflicted ? (
              <div className="attribution-line">
                <strong>What actually happened:</strong> {nameFor(consumers, a.victimConsumerId)} was also the
                largest consumer of the shared budget in the preceding {a.windowSec}s ({formatPct(a.culpritShare)}
                of it) — this one is on it, not on the key.
              </div>
            ) : (
              <div className="attribution-line">
                <strong>What actually happened:</strong> {nameFor(consumers, a.culpritConsumerId)} consumed{' '}
                {formatPct(a.culpritShare)} of the shared budget in the preceding {a.windowSec}s.{' '}
                {nameFor(consumers, a.victimConsumerId)} has no way to see that from its own dashboard.
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
