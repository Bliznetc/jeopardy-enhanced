import { useEffect, useState } from 'react';
import type { HostExtras, RoomState } from '@shared/protocol';
import { socket } from './socket';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import ContestantGame from './pages/ContestantGame';
import HostGame from './pages/HostGame';
import { useGameSounds } from './sound/useGameSounds';
import MuteToggle from './sound/MuteToggle';
import { useAuth } from './auth/AuthContext';
import AuthGate from './auth/AuthGate';

export default function App() {
  const { user, ready, logout } = useAuth();
  const me = user ? String(user.id) : null;

  const [room, setRoom] = useState<RoomState | null>(null);
  const [extras, setExtras] = useState<HostExtras | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onState(s: RoomState) {
      setRoom(s);
      localStorage.setItem('jeopardy.lastRoom', s.code);
    }
    function onHost(h: HostExtras) {
      setExtras(h);
    }
    function onError({ message }: { message: string }) {
      setError(message);
      setRoom(null);
      setExtras(null);
      localStorage.removeItem('jeopardy.lastRoom');
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

  // On (re)connect, re-subscribe to the last room (reclaims seat/score/host).
  useEffect(() => {
    function onConnect() {
      const last = localStorage.getItem('jeopardy.lastRoom');
      if (last) socket.emit('rejoin_room', { code: last }, () => {});
    }
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, []);

  useGameSounds(room, me);

  const isHost = room && me && room.hostId === me;

  if (!ready) return null;

  return (
    <main>
      <div className="app-bar">
        <h1>Jeopardy<span style={{ color: 'var(--gold)', WebkitTextFillColor: 'var(--gold)' }}>!</span></h1>
        <MuteToggle />
      </div>
      {user && (
        <div className="account-bar">
          <span>
            Logged in as <strong>{user.username}</strong>
          </span>
          <button
            className="clear-selection"
            onClick={() => {
              setRoom(null);
              setExtras(null);
              logout();
            }}
          >
            Log out
          </button>
        </div>
      )}
      {error && (
        <div className="error">
          {error}{' '}
          <button onClick={() => setError(null)} className="dismiss">
            dismiss
          </button>
        </div>
      )}
      {!user ? (
        <AuthGate />
      ) : !room || !me ? (
        <Home setError={setError} />
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
