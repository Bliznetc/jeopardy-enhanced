import type { PublicGameState } from '@shared/protocol';
import Buzzer from './Buzzer';
import AnswerInput from './AnswerInput';
import Timer from './Timer';
import { useFullscreen } from '../hooks/useFullscreen';

interface Props {
  game: PublicGameState;
  phase: string;
  me: string;
  isBuzzed: boolean;
  isLocked: boolean;
  isDDPicker: boolean;
  onBuzz: () => void;
  onAnswer: (text: string) => void;
  buzzerName: string;
}

export default function MobileClue({
  game,
  phase,
  isBuzzed,
  isLocked,
  isDDPicker,
  onBuzz,
  onAnswer,
  buzzerName,
}: Props) {
  const { active, toggle } = useFullscreen();
  const clue = game.currentClue;
  return (
    <div className="mobile-clue">
      <button className="fs-toggle" onClick={toggle}>
        {active ? '×' : '⤢'}
      </button>
      <div className="mobile-clue-meta">
        {clue?.category} · ${clue?.value}
      </div>
      <div className="mobile-clue-text">{clue?.clueText}</div>

      {phase === 'buzz_open' && (
        <>
          <Timer endsAt={game.buzzTimerEndsAt} totalMs={10000} label="Buzz" />
          <Buzzer
            armed={game.buzzersArmed}
            lockedOut={isLocked}
            buzzedIn={false}
            onBuzz={() => {
              navigator.vibrate?.(40);
              onBuzz();
            }}
          />
        </>
      )}

      {phase === 'clue_reading' && <div className="banner">Get ready…</div>}

      {phase === 'answering' &&
        (isBuzzed || isDDPicker ? (
          <>
            <Timer endsAt={game.answerTimerEndsAt} totalMs={20000} label="Answer" />
            <AnswerInput onSubmit={onAnswer} placeholder="Your response…" />
          </>
        ) : (
          <div className="banner">{buzzerName} is answering…</div>
        ))}
    </div>
  );
}
