import type { AckResult, HostExtras, RoomState } from '@shared/protocol';
import { socket } from '../socket';
import Board from '../components/Board';
import ClueCard from '../components/ClueCard';
import ScorePanel from '../components/ScorePanel';
import HostJudge from '../components/HostJudge';
import Timer from '../components/Timer';

interface Props {
  room: RoomState;
  extras: HostExtras | null;
  me: string;
}

function ack(res: AckResult) {
  if (!res.ok) alert(res.error);
}

export default function HostGame({ room, extras, me }: Props) {
  const game = room.game;
  if (!game) return <p>Game not started.</p>;

  const phase = room.phase;
  const code = room.code;

  function arm() {
    socket.emit('arm_buzzers', { code }, ack);
  }
  function next() {
    socket.emit('next_clue', { code }, ack);
  }
  function judge(correct: boolean) {
    socket.emit('judge', { code, correct }, ack);
  }
  function startNextRound() {
    socket.emit('start_next_round', { code }, ack);
  }
  function revealNextFinal() {
    socket.emit('reveal_next_final', { code }, ack);
  }
  function judgeFinal(correct: boolean) {
    socket.emit('judge_final', { code, correct }, ack);
  }
  function restart() {
    socket.emit('restart_game', { code }, ack);
  }

  const pickerName =
    game.currentPicker
      ? room.players.find((p) => p.id === game.currentPicker)?.name ?? '—'
      : null;

  return (
    <div className="game host">
      <header className="game-header">
        <span>HOST · Round {game.round === 3 ? 'Final' : game.round}</span>
        {pickerName && <span>Picker: {pickerName}</span>}
      </header>

      {(phase === 'show_board' || phase === 'between_rounds') && (
        <>
          {phase === 'between_rounds' && (
            <div className="banner">
              <p>Round {game.round} complete.</p>
              <button onClick={startNextRound}>
                {game.round === 1
                  ? 'Start Double Jeopardy'
                  : 'Start Final Jeopardy'}
              </button>
            </div>
          )}
          {phase === 'show_board' && game.round !== 3 && (
            <Board game={game} canPick={false} onPick={() => {}} />
          )}
          {phase === 'show_board' && (
            <div className="hint">Picker chooses next…</div>
          )}
        </>
      )}

      {phase === 'clue_reading' && (
        <>
          <ClueCard
            game={game}
            hostExtraResponse={extras?.currentClueResponse}
          />
          <div className="banner">
            <button onClick={arm}>
              {game.currentClue?.isDailyDouble
                ? 'Read clue (Daily Double)'
                : 'Arm buzzers'}
            </button>
          </div>
        </>
      )}

      {phase === 'buzz_open' && (
        <>
          <ClueCard
            game={game}
            hostExtraResponse={extras?.currentClueResponse}
          />
          <Timer endsAt={game.buzzTimerEndsAt} totalMs={10000} label="Time to buzz" />
          <div className="banner">Buzzers armed — waiting for buzz…</div>
        </>
      )}

      {phase === 'answering' && (
        <>
          <ClueCard
            game={game}
            hostExtraResponse={extras?.currentClueResponse}
          />
          <Timer endsAt={game.answerTimerEndsAt} totalMs={20000} label="Time to answer" />
          <div className="banner">
            {room.players.find((p) => p.id === (game.buzzedIn || game.ddPlayer))
              ?.name ?? 'Player'}{' '}
            is typing…
          </div>
        </>
      )}

      {phase === 'judging' && (
        <>
          <ClueCard
            game={game}
            hostExtraResponse={extras?.currentClueResponse}
          />
          <HostJudge
            buzzedAnswerText={extras?.currentBuzzedAnswerText ?? null}
            correctResponse={extras?.currentClueResponse ?? null}
            onJudge={judge}
          />
        </>
      )}

      {phase === 'clue_closed' && (
        <>
          <ClueCard game={game} />
          <div className="banner">
            <button onClick={next}>Next clue</button>
          </div>
        </>
      )}

      {phase === 'daily_double_wager' && (
        <>
          <div className="dd-overlay">DAILY DOUBLE</div>
          <div className="banner">
            {room.players.find((p) => p.id === game.ddPlayer)?.name} is wagering…
          </div>
        </>
      )}

      {(phase === 'fj_category' || phase === 'fj_wager') && (
        <div className="fj">
          <h2>Final Jeopardy</h2>
          <div className="fj-category">{game.finalCategory}</div>
          <p>Eligible:</p>
          <ul>
            {game.fjEligible.map((id) => {
              const p = room.players.find((pp) => pp.id === id);
              const wagered = game.fjWagersSubmitted.includes(id);
              return (
                <li key={id}>
                  {p?.name} — {wagered ? `wagered $${extras?.fjWagers[id] ?? '?'}` : 'wagering…'}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(phase === 'fj_clue' || phase === 'fj_answer') && (
        <div className="fj">
          <h2>Final Jeopardy — {game.finalCategory}</h2>
          <div className="fj-clue">{game.finalClueText}</div>
          <p>
            Correct response:{' '}
            <strong>{extras && game.fjEligible.length > 0 ? game.finalCorrectResponse ?? '—' : '—'}</strong>
          </p>
          <ul>
            {game.fjEligible.map((id) => {
              const p = room.players.find((pp) => pp.id === id);
              const answered = game.fjAnswersSubmitted.includes(id);
              return (
                <li key={id}>
                  {p?.name} — {answered ? 'submitted' : 'typing…'}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase === 'fj_reveal' && (
        <div className="fj">
          <h2>Final Jeopardy reveal</h2>
          <div className="fj-category">{game.finalCategory}</div>
          <div className="fj-clue">{game.finalClueText}</div>
          <div className="fj-correct">
            <small>Correct:</small> {game.finalCorrectResponse}
          </div>
          <ul className="fj-reveals">
            {game.fjReveals.map((r) => (
              <li key={r.playerId} className={r.correct ? 'correct' : 'wrong'}>
                <strong>
                  {room.players.find((p) => p.id === r.playerId)?.name}:
                </strong>{' '}
                "{r.answer}" — wager ${r.wager} — {r.correct ? '✓' : '✗'}
              </li>
            ))}
          </ul>
          {game.fjPending ? (
            <div className="fj-pending">
              <p>
                <strong>
                  {room.players.find((p) => p.id === game.fjPending!.playerId)?.name}
                </strong>{' '}
                wagered <strong>${game.fjPending.wager}</strong> and said:
              </p>
              <p className="fj-pending-answer">
                {game.fjPending.answer ? `"${game.fjPending.answer}"` : '(no answer)'}
              </p>
              <div className="judge-buttons">
                <button className="judge-correct" onClick={() => judgeFinal(true)}>
                  ✓ Correct
                </button>
                <button className="judge-wrong" onClick={() => judgeFinal(false)}>
                  ✗ Incorrect
                </button>
              </div>
            </div>
          ) : (
            <div className="banner">
              <button onClick={revealNextFinal}>Reveal next contestant</button>
            </div>
          )}
        </div>
      )}

      {phase === 'game_over' && (
        <div className="game-over">
          <div className="game-over-stars" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => <span key={i} className="star" />)}
          </div>
          <h2>Game Over</h2>
          {game.winner && (
            <p>
              Winner:{' '}
              <strong>
                {room.players.find((p) => p.id === game.winner)?.name ?? '—'}
              </strong>
            </p>
          )}
          <button onClick={restart}>Play another game</button>
        </div>
      )}

      <ScorePanel players={room.players} game={game} me={me} />
    </div>
  );
}
