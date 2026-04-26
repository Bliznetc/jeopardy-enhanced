import type { PublicGameState } from '@shared/protocol';

interface Props {
  game: PublicGameState;
  canPick: boolean;
  onPick: (round: number, category: string, value: number) => void;
}

export default function Board({ game, canPick, onPick }: Props) {
  const view =
    game.round === 1 ? game.round1 : game.round === 2 ? game.round2 : null;
  if (!view) return null;

  const cleared = new Set(
    game.cleared
      .filter((c) => c.round === game.round)
      .map((c) => `${c.category}|${c.value}`)
  );

  return (
    <div className="board">
      {view.categories.map((cat) => (
        <div className="board-col" key={cat}>
          <div className="board-cat">{cat}</div>
          {view.valueTiers.map((value) => {
            const isCleared = cleared.has(`${cat}|${value}`);
            const cellClass = `board-cell${isCleared ? ' cleared' : ''}${
              canPick && !isCleared ? ' clickable' : ''
            }`;
            return (
              <button
                key={value}
                className={cellClass}
                disabled={!canPick || isCleared}
                onClick={() => onPick(game.round, cat, value)}
              >
                {isCleared ? '' : `$${value}`}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
