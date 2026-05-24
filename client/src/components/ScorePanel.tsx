import { useEffect, useRef, useState } from 'react';
import type { Player, PublicGameState } from '@shared/protocol';

interface Props {
  players: Player[];
  game: PublicGameState | null;
  me: string;
}

function AnimatedScore({ value }: { value: number }) {
  const [flash, setFlash] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 500);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <div
      className={`score-value${value < 0 ? ' negative' : ''}${flash ? ' pop' : ''}`}
      style={flash ? { animation: 'scorePop 0.5s ease' } : undefined}
    >
      {value < 0 ? `-$${Math.abs(value).toLocaleString()}` : `$${value.toLocaleString()}`}
    </div>
  );
}

export default function ScorePanel({ players, game, me }: Props) {
  const contestants = players.filter((p) => p.role === 'contestant');

  return (
    <div className="score-panel">
      {contestants.map((p) => {
        const score = game?.scores?.[p.id] ?? p.score ?? 0;
        const isPicker = game?.currentPicker === p.id;
        const isBuzzed = game?.buzzedIn === p.id;
        const isLocked = game?.lockedOut?.includes(p.id);
        return (
          <div
            key={p.id}
            className={`score-card${isPicker ? ' picker' : ''}${isBuzzed ? ' buzzed' : ''}${isLocked ? ' locked' : ''}${!p.connected ? ' offline' : ''}`}
          >
            <div className="score-name">
              {p.name}
              {p.id === me && ' ·you'}
            </div>
            <AnimatedScore value={score} />
            {isPicker && <div className="score-tag">picker</div>}
            {isBuzzed && <div className="score-tag">answering</div>}
          </div>
        );
      })}
    </div>
  );
}
