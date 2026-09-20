import type { BucketSample } from '../lib/types';
import { formatTokens } from '../lib/format';

interface Props {
  label: string;
  sample: BucketSample | undefined;
  kind: 'rpm' | 'tpm';
}

export function BudgetMeter({ label, sample, kind }: Props) {
  const remaining = kind === 'rpm' ? (sample?.requestTokensRemaining ?? 0) : (sample?.tpmTokensRemaining ?? 0);
  const capacity = kind === 'rpm' ? (sample?.requestCapacity ?? 1) : (sample?.tpmCapacity ?? 1);
  const pct = capacity > 0 ? Math.max(0, Math.min(1, remaining / capacity)) : 0;
  const danger = pct < 0.15;

  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span className="meter-value">
          {formatTokens(remaining)} / {formatTokens(capacity)}
        </span>
      </div>
      <div className="meter-track">
        <div
          className={`meter-fill${danger ? ' meter-fill-danger' : ''}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
