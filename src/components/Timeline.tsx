import type { Consumer, SimEvent } from '../lib/types';
import { formatClock } from '../lib/format';

interface Props {
  consumers: Consumer[];
  events: SimEvent[];
  durationSec: number;
  currentT: number;
  onScrub: (t: number) => void;
}

const LANE_HEIGHT = 34;
const TOP_PADDING = 8;

export function Timeline({ consumers, events, durationSec, currentT, onScrub }: Props) {
  const width = 900;
  const height = consumers.length * LANE_HEIGHT + TOP_PADDING * 2;
  const xFor = (t: number) => (t / durationSec) * (width - 16) + 8;
  const visible = events.filter((e) => e.tSec <= currentT);

  return (
    <div className="timeline-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="timeline-svg"
        role="img"
        aria-label="Per-consumer request timeline"
      >
        {consumers.map((c, i) => {
          const y = TOP_PADDING + i * LANE_HEIGHT + LANE_HEIGHT / 2;
          return (
            <g key={c.id}>
              <line x1={8} y1={y} x2={width - 8} y2={y} className="timeline-lane-line" />
              <text x={2} y={y - 12} className="timeline-lane-label">
                {c.name}
              </text>
            </g>
          );
        })}
        {visible.map((e, i) => {
          const laneIndex = consumers.findIndex((c) => c.id === e.consumerId);
          if (laneIndex === -1) return null;
          const y = TOP_PADDING + laneIndex * LANE_HEIGHT + LANE_HEIGHT / 2;
          const x = xFor(e.tSec);
          const color = consumers[laneIndex].color;
          return e.allowed ? (
            <circle key={i} cx={x} cy={y} r={2.6} fill={color} opacity={0.85} />
          ) : (
            <g key={i}>
              <line x1={x} y1={y - 7} x2={x} y2={y + 7} stroke="#e0334a" strokeWidth={2} />
            </g>
          );
        })}
        <line
          x1={xFor(currentT)}
          y1={0}
          x2={xFor(currentT)}
          y2={height}
          className="timeline-playhead"
        />
      </svg>
      <input
        type="range"
        min={0}
        max={durationSec - 1}
        value={Math.floor(currentT)}
        onChange={(e) => onScrub(Number(e.target.value))}
        className="scrub"
        aria-label="Scrub timeline"
      />
      <div className="timeline-clock">{formatClock(currentT)} / {formatClock(durationSec)}</div>
    </div>
  );
}
