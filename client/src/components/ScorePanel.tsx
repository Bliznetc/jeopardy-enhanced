import type { Player, PublicGameState } from '@shared/protocol';

interface Props {
  players: Player[];
  game: PublicGameState | null;
  me: string;
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
            className={`score-card${isPicker ? ' picker' : ''}${
              isBuzzed ? ' buzzed' : ''
            }${isLocked ? ' locked' : ''}${!p.connected ? ' offline' : ''}`}
          >
            <div className="score-name">
              {p.name}
              {p.id === me && ' (you)'}
            </div>
            <div className={`score-value${score < 0 ? ' negative' : ''}`}>
              ${score.toLocaleString()}
            </div>
            {isPicker && <div className="score-tag">picker</div>}
            {isBuzzed && <div className="score-tag">answering</div>}
          </div>
        );
      })}
    </div>
  );
}
