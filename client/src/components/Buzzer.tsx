interface Props {
  armed: boolean;
  lockedOut: boolean;
  buzzedIn: boolean;
  onBuzz: () => void;
}

export default function Buzzer({ armed, lockedOut, buzzedIn, onBuzz }: Props) {
  const label = buzzedIn
    ? 'YOU BUZZED IN'
    : lockedOut
    ? 'LOCKED OUT'
    : armed
    ? 'BUZZ!'
    : 'WAIT…';
  const cls = `buzzer${armed && !lockedOut && !buzzedIn ? ' armed' : ''}${
    lockedOut ? ' locked' : ''
  }${buzzedIn ? ' won' : ''}`;
  return (
    <button
      className={cls}
      disabled={!armed || lockedOut || buzzedIn}
      onClick={onBuzz}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if (armed && !lockedOut && !buzzedIn) onBuzz();
        }
      }}
    >
      {label}
    </button>
  );
}
