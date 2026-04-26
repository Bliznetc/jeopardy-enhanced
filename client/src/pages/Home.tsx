import { useState } from 'react';
import type { AckResult } from '@shared/protocol';
import { socket } from '../socket';

interface Props {
  setMe: (id: string) => void;
  setError: (e: string) => void;
}

export default function Home({ setMe, setError }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter a name');
    socket.emit('create_room', { name: trimmed }, (res: AckResult<{ code: string; playerId: string }>) => {
      if (!res.ok) return setError(res.error);
      setMe(res.data.playerId);
    });
  }

  function join() {
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    if (!trimmedName) return setError('Enter a name');
    if (trimmedCode.length !== 4) return setError('Room code is 4 characters');
    socket.emit(
      'join_room',
      { code: trimmedCode, name: trimmedName },
      (res: AckResult<{ playerId: string }>) => {
        if (!res.ok) return setError(res.error);
        setMe(res.data.playerId);
      }
    );
  }

  return (
    <section className="home">
      <label>
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="e.g. Alice"
        />
      </label>

      <div className="actions">
        <div className="card">
          <h2>Host a game</h2>
          <p>You'll judge each answer. Game needs 2–4 contestants.</p>
          <button onClick={create} disabled={!name.trim()}>
            Create room
          </button>
        </div>
        <div className="card">
          <h2>Join a game</h2>
          <input
            placeholder="ABCD"
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button onClick={join} disabled={!name.trim() || code.length !== 4}>
            Join
          </button>
        </div>
      </div>
    </section>
  );
}
