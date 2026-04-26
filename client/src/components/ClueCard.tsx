import type { PublicGameState } from '@shared/protocol';

interface Props {
  game: PublicGameState;
  hostExtraResponse?: string | null;
}

export default function ClueCard({ game, hostExtraResponse }: Props) {
  const c = game.currentClue;
  if (!c) return null;

  // Show the correct response when:
  //  - the public game state surfaces it (clue_closed, between_rounds, game_over), OR
  //  - the host has access to it via host_state, regardless of phase.
  const responseToShow = c.correctResponse ?? hostExtraResponse ?? null;

  return (
    <div className={`clue-card${c.isDailyDouble ? ' dd' : ''}`}>
      <div className="clue-meta">
        <span>{c.category}</span>
        <span>${c.value}</span>
      </div>
      {c.isDailyDouble && <div className="dd-banner">DAILY DOUBLE</div>}
      <div className="clue-text">{c.clueText}</div>
      {responseToShow && (
        <div className="clue-response">
          <small>Correct response:</small>
          <div>{responseToShow}</div>
        </div>
      )}
    </div>
  );
}
