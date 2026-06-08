import { useState } from 'react';
import { sound } from './SoundEngine';

export default function MuteToggle() {
  const [muted, setMuted] = useState(sound.isMuted());
  return (
    <button
      className="mute-toggle"
      aria-label={muted ? 'Unmute' : 'Mute'}
      onClick={() => {
        sound.resume();
        const next = !muted;
        sound.setMuted(next);
        setMuted(next);
      }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
