import type { Consumer, ConsumerStats } from '../lib/types';
import { formatTokens } from '../lib/format';

interface Props {
  consumers: Consumer[];
  stats: ConsumerStats[];
}

export function StatsTable({ consumers, stats }: Props) {
  return (
    <table className="stats-table">
      <thead>
        <tr>
          <th>Consumer</th>
          <th>Sent</th>
          <th>Allowed</th>
          <th>Denied</th>
          <th>Denial rate</th>
          <th>Tokens consumed</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => {
          const consumer = consumers.find((c) => c.id === s.consumerId);
          const rate = s.sent > 0 ? Math.round((s.denied / s.sent) * 100) : 0;
          return (
            <tr key={s.consumerId}>
              <td>
                <span className="dot" style={{ background: consumer?.color }} />
                {consumer?.name ?? s.consumerId}
              </td>
              <td>{s.sent}</td>
              <td>{s.allowed}</td>
              <td>{s.denied}</td>
              <td className={rate > 0 ? 'rate-bad' : ''}>{rate}%</td>
              <td>{formatTokens(s.tokensConsumed)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
