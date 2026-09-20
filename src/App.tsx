import { useEffect, useMemo, useRef, useState } from 'react';
import { SCENARIOS } from './lib/presets';
import { simulate, statsUpTo } from './lib/simulate';
import { formatClock } from './lib/format';
import { BudgetMeter } from './components/BudgetMeter';
import { Timeline } from './components/Timeline';
import { AttributionFeed } from './components/AttributionFeed';
import { StatsTable } from './components/StatsTable';

const SPEEDS = [1, 2, 4] as const;

export default function App() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const scenario = useMemo(() => SCENARIOS.find((s) => s.id === scenarioId)!, [scenarioId]);
  const result = useMemo(() => simulate(scenario.config), [scenario]);
  const [currentT, setCurrentT] = useState(0);
  const statsSoFar = useMemo(
    () => statsUpTo(result.events, scenario.config.consumers, currentT),
    [result, scenario, currentT],
  );
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRef = useRef<number | undefined>(undefined);

  // Reset playback whenever the scenario changes.
  useEffect(() => {
    setCurrentT(0);
    setPlaying(true);
    lastRef.current = undefined;
  }, [scenarioId]);

  useEffect(() => {
    if (!playing) {
      lastRef.current = undefined;
      return;
    }
    const tick = (now: number) => {
      if (lastRef.current === undefined) lastRef.current = now;
      const dtSec = ((now - lastRef.current) / 1000) * speed;
      lastRef.current = now;
      setCurrentT((prev) => {
        const next = prev + dtSec;
        if (next >= scenario.config.durationSec - 1) {
          setPlaying(false);
          return scenario.config.durationSec - 1;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, scenarioId]);

  const sampleIndex = Math.min(Math.floor(currentT), result.bucketHistory.length - 1);
  const currentSample = result.bucketHistory[sampleIndex];

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Day 036 · kb-daily-builds</p>
        <h1>Quota Commons</h1>
        <p className="tagline">
          One API key. A user-facing app, a fallback router and a batch job, none of them able to see the other
          two. Watch whose request pays for whose retry.
        </p>
      </header>

      <nav className="scenario-picker" aria-label="Scenario">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            className={s.id === scenarioId ? 'scenario-btn scenario-btn-active' : 'scenario-btn'}
            onClick={() => setScenarioId(s.id)}
          >
            <span className="scenario-name">{s.name}</span>
            <span className="scenario-tagline">{s.tagline}</span>
          </button>
        ))}
      </nav>

      <section className="panel">
        <div className="playback-controls">
          <button onClick={() => setPlaying((p) => !p)} className="play-btn">
            {playing ? 'Pause' : currentT >= scenario.config.durationSec - 1 ? 'Replay' : 'Play'}
          </button>
          <button
            onClick={() => {
              setCurrentT(0);
              setPlaying(true);
              lastRef.current = undefined;
            }}
            className="restart-btn"
          >
            Restart
          </button>
          <div className="speed-group" role="group" aria-label="Playback speed">
            {SPEEDS.map((sp) => (
              <button
                key={sp}
                className={sp === speed ? 'speed-btn speed-btn-active' : 'speed-btn'}
                onClick={() => setSpeed(sp)}
              >
                {sp}×
              </button>
            ))}
          </div>
        </div>

        <div className="meters">
          <BudgetMeter label="Requests / min" sample={currentSample} kind="rpm" />
          <BudgetMeter label="Tokens / min" sample={currentSample} kind="tpm" />
        </div>

        <Timeline
          consumers={scenario.config.consumers}
          events={result.events}
          durationSec={scenario.config.durationSec}
          currentT={currentT}
          onScrub={(t) => {
            setPlaying(false);
            setCurrentT(t);
          }}
        />
      </section>

      <section className="panel two-col">
        <div>
          <h2>What each side would tell you</h2>
          <AttributionFeed attributions={result.attributions} consumers={scenario.config.consumers} currentT={currentT} />
        </div>
        <div>
          <h2>Totals so far</h2>
          <p className="panel-note">
            Everything the run has done up to {formatClock(currentT)}, which is where the
            scrubber is. Scrub to the end for the whole {formatClock(scenario.config.durationSec)}.
          </p>
          <StatsTable consumers={scenario.config.consumers} stats={statsSoFar} />
        </div>
      </section>

      <section className="panel honesty">
        <h2>What this is and isn't</h2>
        <p>
          This is a deterministic simulation, not a live provider dashboard. The three scenarios above use
          illustrative rate limits and traffic patterns: nothing here calls OpenAI, Azure OpenAI, Anthropic or any
          other API, and no real quota is read. The token-bucket algorithm (continuous refill, hard cap) is the
          same one every major provider documents for its own RPM/TPM limits; the consumers, their timing and
          their token costs are made up for this demo.
        </p>
        <p>
          One deliberate simplification: within a single simulated second, consumers are offered to the shared
          budget in the order they're declared in the scenario, every tick, and there's no fairness scheduler.
          That isn't a shortcut around something more realistic; it's close to the actual mechanism. A shared API
          key has no scheduler either. Whichever client's request lands on the wire first that instant is the one
          that gets the token. Nothing coordinates the fallback router, the batch job and the user-facing app
          except the number in the response header, and the header doesn't say who else is calling.
        </p>
        <p>
          Riding the signal: in the week of 8–14 Sep 2026, usage limits got tighter across more than one provider.
          OpenAI reportedly cut ChatGPT usage limits by up to 4× for Astra — unconfirmed by OpenAI itself;
          reporting surfaced 6–7 Sep after a full banked reset on 5 Sep — and Google's Antigravity users hit
          blanket "individual quota reached" errors through 13 Sep. Neither incident is about several internal
          consumers quietly sharing one key; that's this tool's scenario, not theirs. What the two incidents
          change is the margin: a budget that used to have slack to hide an uncoordinated batch job or a retry
          storm has less of it now, on every provider, at the same time.
        </p>
      </section>

      <footer className="page-footer">
        Built by <a href="https://www.kumarbipul.com">Kumar Bipul</a> ·{' '}
        <a href="https://github.com/kbipul">github.com/kbipul</a> ·{' '}
        <a href="https://github.com/kbipul/kb-daily-builds">kb-daily-builds</a>
      </footer>
    </div>
  );
}
