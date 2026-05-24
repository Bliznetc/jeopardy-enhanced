import { useEffect, useState } from 'react';
import type { HostExtras, RoomState } from '@shared/protocol';
import { socket } from './socket';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import ContestantGame from './pages/ContestantGame';
import HostGame from './pages/HostGame';

export default function App() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [extras, setExtras] = useState<HostExtras | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onState(s: RoomState) {
      setRoom(s);
    }
    function onHost(h: HostExtras) {
      setExtras(h);
    }
    function onError({ message }: { message: string }) {
      setError(message);
      setRoom(null);
      setExtras(null);
      setMe(null);
    }
    socket.on('room_state', onState);
    socket.on('host_state', onHost);
    socket.on('error_event', onError);
    return () => {
      socket.off('room_state', onState);
      socket.off('host_state', onHost);
      socket.off('error_event', onError);
    };
  }, []);

  const isHost = room && me && room.hostId === me;

  return (
    <main>
      <h1>Jeopardy<span style={{ color: 'var(--gold)', WebkitTextFillColor: 'var(--gold)' }}>!</span></h1>
      {error && (
        <div className="error">
          {error}{' '}
          <button onClick={() => setError(null)} className="dismiss">
            dismiss
          </button>
        </div>
      )}
      {!room || !me ? (
        <Home setMe={setMe} setError={setError} />
      ) : room.phase === 'lobby' ? (
        <Lobby room={room} me={me} />
      ) : isHost ? (
        <HostGame room={room} extras={extras} me={me} />
      ) : (
        <ContestantGame room={room} me={me} />
      )}
    </main>
  );
}
