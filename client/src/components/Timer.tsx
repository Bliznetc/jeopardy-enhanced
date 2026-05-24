import { useEffect, useState } from 'react';

interface Props {
  endsAt: number | null;
  totalMs: number;
  label?: string;
}

export default function Timer({ endsAt, totalMs, label }: Props) {
  const [remaining, setRemaining] = useState<number>(totalMs);

  useEffect(() => {
    if (endsAt === null) {
      setRemaining(totalMs);
      return;
    }
    function tick() {
      const left = Math.max(0, endsAt! - Date.now());
      setRemaining(left);
    }
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [endsAt, totalMs]);

  const pct = totalMs > 0 ? remaining / totalMs : 0;
  const secs = Math.ceil(remaining / 1000);

  // Color transitions: green → amber → red
  let color: string;
  if (pct > 0.5) color = 'var(--green)';
  else if (pct > 0.25) color = 'var(--accent)';
  else color = 'var(--red)';

  return (
    <div className="timer">
      {label && <div className="timer-label">{label}</div>}
      <div className="timer-bar-track">
        <div
          className="timer-bar"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
      <div className="timer-seconds" style={{ color }}>{secs}s</div>
    </div>
  );
}
