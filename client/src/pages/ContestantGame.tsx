import type { AckResult, RoomState } from '@shared/protocol';
import { socket } from '../socket';
import Board from '../components/Board';
import ClueCard from '../components/ClueCard';
import Buzzer from '../components/Buzzer';
import ScorePanel from '../components/ScorePanel';
import WagerInput from '../components/WagerInput';
import AnswerInput from '../components/AnswerInput';
import Timer from '../components/Timer';
import MobileClue from '../components/MobileClue';
import { useIsMobile } from '../hooks/useIsMobile';

interface Props {
  room: RoomState;
  me: string;
}

function ackHandler(setError: (msg: string) => void) {
  return (res: AckResult) => {
    if (!res.ok) setError(res.error);
  };
}

export default function ContestantGame({ room, me }: Props) {
  const game = room.game;
  if (!game) return <p>Waiting for game…</p>;

  const phase = room.phase;
  const isPicker = game.currentPicker === me;
  const isBuzzed = game.buzzedIn === me;
  const isLocked = game.lockedOut.includes(me);
  const isDDPicker = game.ddPlayer === me;
  const myScore = game.scores[me] ?? 0;

  function setError(msg: string) {
    alert(msg);
  }
  const ack = ackHandler(setError);

  function pick(round: number, category: string, value: number) {
    socket.emit('pick_clue', { code: room.code, round, category, value }, ack);
  }
  function buzz() {
    socket.emit('buzz', { code: room.code }, ack);
  }
  function submitAnswer(text: string) {
    socket.emit('submit_answer', { code: room.code, text }, ack);
  }
  function submitDDWager(amount: number) {
    socket.emit('submit_wager', { code: room.code, amount }, ack);
  }
  function submitFJWager(amount: number) {
    socket.emit('submit_wager', { code: room.code, amount }, ack);
  }
  function submitFJAnswer(text: string) {
    socket.emit('submit_answer', { code: room.code, text }, ack);
  }

  // Compute DD wager bounds (must mirror server's scoring.ts)
  const tiers = game.round === 1 ? game.round1.valueTiers : game.round2.valueTiers;
  const ddMax = Math.max(myScore, Math.max(...tiers));
  const ddMin = 5;

  const fjMax = Math.max(0, myScore);

  const isMobile = useIsMobile();
  const buzzerName =
    room.players.find((p) => p.id === game.buzzedIn || p.id === game.ddPlayer)?.name ?? 'Someone';
  const mobileClueActive =
    isMobile && (phase === 'clue_reading' || phase === 'buzz_open' || phase === 'answering');

  return (
    <div className="game contestant">
      <header className="game-header">
        <span>Round {game.round === 3 ? 'Final' : game.round}</span>
        {game.currentPicker && (
          <span>
            Picker:{' '}
            {room.players.find((p) => p.id === game.currentPicker)?.name ?? '—'}
          </span>
        )}
      </header>

      {(phase === 'show_board' || phase === 'between_rounds') && (
        <>
          {phase === 'between_rounds' && (
            <div className="banner">
              Round {game.round} complete —{' '}
              {room.autopilot ? 'next round starting shortly…' : 'waiting for host…'}
            </div>
          )}
          {phase === 'show_board' && game.round !== 3 && (
            <Board
              game={game}
              canPick={isPicker}
              onPick={pick}
            />
          )}
        </>
      )}

      {mobileClueActive && (
        <MobileClue
          game={game}
          phase={phase}
          me={me}
          isBuzzed={isBuzzed}
          isLocked={isLocked}
          isDDPicker={isDDPicker}
          onBuzz={buzz}
          onAnswer={submitAnswer}
          buzzerName={buzzerName}
        />
      )}

      {!mobileClueActive && phase === 'clue_reading' && (
        <>
          <ClueCard game={game} />
          <div className="banner">
            {room.autopilot ? 'Get ready…' : 'Host is reading the clue…'}
          </div>
        </>
      )}

      {!mobileClueActive && phase === 'buzz_open' && (
        <>
          <ClueCard game={game} />
          <Timer endsAt={game.buzzTimerEndsAt} totalMs={10000} label="Time to buzz" />
          <Buzzer
            armed={game.buzzersArmed}
            lockedOut={isLocked}
            buzzedIn={false}
            onBuzz={buzz}
          />
        </>
      )}

      {!mobileClueActive && phase === 'answering' && (
        <>
          <ClueCard game={game} />
          {(isBuzzed || isDDPicker) && (
            <Timer endsAt={game.answerTimerEndsAt} totalMs={20000} label="Time to answer" />
          )}
          {isBuzzed || isDDPicker ? (
            <AnswerInput onSubmit={submitAnswer} placeholder="Your response…" />
          ) : (
            <div className="banner">
              {buzzerName} is answering…
            </div>
          )}
        </>
      )}

      {phase === 'judging' && (
        <>
          <ClueCard game={game} />
          <div className="banner">
            {room.autopilot ? 'Checking answer…' : 'Host is judging the answer…'}
          </div>
        </>
      )}

      {phase === 'clue_closed' && (
        <>
          <ClueCard game={game} />
          <div className="banner">
            {room.autopilot ? 'Moving on shortly…' : 'Waiting for the host to advance…'}
          </div>
        </>
      )}

      {phase === 'daily_double_wager' && (
        <>
          <div className="dd-overlay">DAILY DOUBLE!</div>
          {isDDPicker ? (
            <WagerInput
              min={ddMin}
              max={ddMax}
              onSubmit={submitDDWager}
              label={`Daily Double wager ($${ddMin} – $${ddMax.toLocaleString()})`}
            />
          ) : (
            <div className="banner">
              {room.players.find((p) => p.id === game.ddPlayer)?.name} is wagering…
            </div>
          )}
        </>
      )}

      {(phase === 'fj_category' || phase === 'fj_wager') && (
        <>
          <div className="fj">
            <h2>Final Jeopardy</h2>
            <div className="fj-category">{game.finalCategory}</div>
          </div>
          {game.fjEligible.includes(me) ? (
            game.fjWagersSubmitted.includes(me) ? (
              <div className="banner">Wager submitted — waiting for others…</div>
            ) : (
              <WagerInput
                min={0}
                max={fjMax}
                onSubmit={submitFJWager}
                label={`Final wager ($0 – $${fjMax.toLocaleString()})`}
              />
            )
          ) : (
            <div className="banner">You're not eligible for Final Jeopardy (score must be positive).</div>
          )}
        </>
      )}

      {(phase === 'fj_clue' || phase === 'fj_answer') && (
        <>
          <div className="fj">
            <h2>Final Jeopardy — {game.finalCategory}</h2>
            <div className="fj-clue">{game.finalClueText}</div>
          </div>
          {game.fjEligible.includes(me) ? (
            game.fjAnswersSubmitted.includes(me) ? (
              <div className="banner">Answer submitted — waiting for others…</div>
            ) : (
              <AnswerInput
                onSubmit={submitFJAnswer}
                placeholder="Your final response…"
                buttonLabel="Lock it in"
              />
            )
          ) : (
            <div className="banner">Watch and wait…</div>
          )}
        </>
      )}

      {phase === 'fj_reveal' && (
        <div className="fj">
          <h2>Final Jeopardy reveal</h2>
          <div className="fj-category">{game.finalCategory}</div>
          <div className="fj-clue">{game.finalClueText}</div>
          {game.finalCorrectResponse && (
            <div className="fj-correct">
              <small>Correct response:</small> {game.finalCorrectResponse}
            </div>
          )}
          <ul className="fj-reveals">
            {game.fjReveals.map((r) => (
              <li key={r.playerId} className={r.correct ? 'correct' : 'wrong'}>
                <strong>
                  {room.players.find((p) => p.id === r.playerId)?.name}:
                </strong>{' '}
                "{r.answer}" — wager ${r.wager} — {r.correct ? '✓' : '✗'}
              </li>
            ))}
            {game.fjPending && (
              <li className="pending">
                <strong>
                  {room.players.find((p) => p.id === game.fjPending!.playerId)?.name}:
                </strong>{' '}
                "{game.fjPending.answer}" — wager ${game.fjPending.wager} — judging…
              </li>
            )}
          </ul>
          <div className="banner">
            {room.autopilot ? 'Revealing results…' : 'Waiting for the host to advance reveals…'}
          </div>
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
          {room.autopilot && (
            <p className="hint">New game starting shortly…</p>
          )}
        </div>
      )}

      <ScorePanel players={room.players} game={game} me={me} />
    </div>
  );
}
