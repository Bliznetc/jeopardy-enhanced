import { useState } from 'react';
import type { AckResult } from '@shared/protocol';
import { socket } from '../socket';

interface Props {
  setError: (e: string) => void;
}

export default function Home({ setError }: Props) {
  const [code, setCode] = useState('');
  const [autopilot, setAutopilot] = useState(false);

  function create() {
    socket.emit('create_room', { autopilot }, (res: AckResult<{ code: string; playerId: string }>) => {
      if (!res.ok) return setError(res.error);
      localStorage.setItem('jeopardy.lastRoom', res.data.code);
    });
  }

  function join() {
    const trimmedCode = code.trim();
    if (trimmedCode.length !== 4) return setError('Room code is 4 characters');
    socket.emit('join_room', { code: trimmedCode }, (res: AckResult<{ playerId: string }>) => {
      if (!res.ok) return setError(res.error);
      localStorage.setItem('jeopardy.lastRoom', trimmedCode.toUpperCase());
    });
  }

  return (
    <section className="home">
      <div className="actions">
        <div className="card">
          <h2>Host a game</h2>
          <p>
            {autopilot
              ? 'Bot host judges answers automatically. Game starts when 2+ players join.'
              : "You'll judge each answer. Game needs 2–4 contestants."}
          </p>
          <label className="autopilot-toggle">
            <input
              type="checkbox"
              checked={autopilot}
              onChange={(e) => setAutopilot(e.target.checked)}
            />
            Autopilot mode
          </label>
          <button onClick={create}>Create room</button>
        </div>
        <div className="card">
          <h2>Join a game</h2>
          <input
            placeholder="ABCD"
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button onClick={join} disabled={code.length !== 4}>
            Join
          </button>
        </div>
      </div>
    </section>
  );
}
