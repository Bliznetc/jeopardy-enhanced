import type { AckResult, RoomState } from '@shared/protocol';
import { socket } from '../socket';

interface Props {
  room: RoomState;
  me: string;
}

export default function Lobby({ room, me }: Props) {
  const isHost = room.hostId === me;
  const host = room.players.find((p) => p.role === 'host');
  const contestants = room.players.filter((p) => p.role === 'contestant');
  const canStart = isHost && contestants.length >= 2 && contestants.length <= 4;

  function start() {
    socket.emit('start_game', { code: room.code }, (res: AckResult) => {
      if (!res.ok) alert(res.error);
    });
  }

  return (
    <section className="lobby">
      <h2>
        Room <code>{room.code}</code>
      </h2>
      <p>Share this code with your friends.</p>

      <ul className="players">
        {host && (
          <li className="host">
            <strong>{host.name}</strong> — host (judge)
            {host.id === me && ' (you)'}
          </li>
        )}
        {contestants.map((p) => (
          <li key={p.id}>
            {p.name}
            {p.id === me && ' (you)'}
          </li>
        ))}
        {contestants.length === 0 && (
          <li className="empty">Waiting for contestants…</li>
        )}
      </ul>

      {isHost ? (
        <button onClick={start} disabled={!canStart}>
          {canStart
            ? 'Start game'
            : `Need 2–4 contestants (have ${contestants.length})`}
        </button>
      ) : (
        <p className="hint">Waiting for the host to start…</p>
      )}
    </section>
  );
}
