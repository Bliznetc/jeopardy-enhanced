import { useEffect, useState } from 'react';
import type { AckResult, RoomState } from '@shared/protocol';
import { socket } from '../socket';

interface EpisodeResult {
  airDate: string;
  categories: string[];
}

interface Props {
  room: RoomState;
  me: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1983 }, (_, i) => CURRENT_YEAR - i);

export default function Lobby({ room, me }: Props) {
  const isHost = room.hostId === me;
  const isCreator = room.creatorId === me;
  const canManageEpisode = isHost || (room.autopilot && isCreator);

  const host = room.players.find((p) => p.role === 'host');
  const contestants = room.players.filter((p) => p.role === 'contestant');
  const canStart = isHost && !room.autopilot && contestants.length >= 2 && contestants.length <= 4;

  const amReady = room.readyPlayerIds.includes(me);
  const allReady = contestants.length >= 2 && contestants.every((p) => room.readyPlayerIds.includes(p.id));

  // Episode picker state
  const [categories, setCategories] = useState<string[]>([]);
  const [catInput, setCatInput] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [results, setResults] = useState<EpisodeResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Load top categories once
  useEffect(() => {
    if (!canManageEpisode) return;
    fetch('/api/categories')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setCategories(data); })
      .catch(() => {});
  }, [canManageEpisode]);

  // Reload categories when year changes
  useEffect(() => {
    if (!canManageEpisode) return;
    const url = selectedYear ? `/api/categories?year=${selectedYear}` : '/api/categories';
    fetch(url)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setCategories(data); })
      .catch(() => {});
  }, [selectedYear, canManageEpisode]);

  async function search() {
    if (catInput.trim().length < 2) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const params = new URLSearchParams({ q: catInput.trim() });
      if (selectedYear) params.set('year', selectedYear);
      const res = await fetch(`/api/episodes/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setResults(data as EpisodeResult[]);
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function selectEpisode(ep: EpisodeResult) {
    socket.emit(
      'set_episode_selection',
      { code: room.code, airDate: ep.airDate, categories: ep.categories },
      (res: AckResult) => { if (!res.ok) alert(res.error); }
    );
    setResults(null);
    setCatInput('');
  }

  function clearSelection() {
    socket.emit(
      'set_episode_selection',
      { code: room.code, airDate: null },
      (res: AckResult) => { if (!res.ok) alert(res.error); }
    );
    setResults(null);
  }

  function start() {
    const data: { code: string; airDate?: string } = { code: room.code };
    if (room.selectedEpisode) data.airDate = room.selectedEpisode.airDate;
    socket.emit('start_game', data, (res: AckResult) => {
      if (!res.ok) alert(res.error);
    });
  }

  function markReady() {
    socket.emit('player_ready', { code: room.code }, (res: AckResult) => {
      if (!res.ok) alert(res.error);
    });
  }

  function formatDate(s: string) {
    return new Date(s + 'T12:00:00').toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  return (
    <section className="lobby">
      <h2>
        Room <code>{room.code}</code>
        {room.autopilot && <span className="autopilot-badge"> Autopilot</span>}
      </h2>
      <p>Share this code with your friends.</p>

      <ul className="players">
        {host && (
          <li className="host">
            <strong>{host.name}</strong> — host (judge)
            {host.id === me && ' (you)'}
          </li>
        )}
        {contestants.map((p) => {
          const ready = room.readyPlayerIds.includes(p.id);
          return (
            <li key={p.id} className={ready ? 'player-ready' : ''}>
              {room.autopilot && (
                <span className={`ready-dot ${ready ? 'ready' : 'waiting'}`} />
              )}
              {p.name}
              {p.id === me && ' (you)'}
              {room.autopilot && ready && <span className="ready-label"> ready</span>}
            </li>
          );
        })}
        {contestants.length === 0 && (
          <li className="empty">Waiting for contestants…</li>
        )}
      </ul>

      {/* Episode picker — shown for host (non-autopilot) or creator (autopilot) */}
      {canManageEpisode && (
        <div className="episode-search">
          <h3>Episode picker <span className="optional-tag">optional</span></h3>

          {room.selectedEpisode ? (
            <div className="episode-selected">
              <div className="episode-selected-date">
                {formatDate(room.selectedEpisode.airDate)}
              </div>
              <div className="episode-selected-cats">
                {room.selectedEpisode.categories.slice(0, 6).join(' · ')}
              </div>
              <button className="clear-selection" onClick={clearSelection}>
                × Use random episode
              </button>
            </div>
          ) : (
            <>
              <div className="search-controls">
                <div className="search-row">
                  <input
                    id="cat-input"
                    type="text"
                    list="cat-datalist"
                    placeholder="Type or pick a category…"
                    value={catInput}
                    onChange={(e) => setCatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && search()}
                    autoComplete="off"
                  />
                  <datalist id="cat-datalist">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                  <select
                    value={selectedYear}
                    onChange={(e) => { setSelectedYear(e.target.value); setResults(null); }}
                    className="year-select"
                  >
                    <option value="">Any year</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <button onClick={search} disabled={searching || catInput.trim().length < 2}>
                  {searching ? '…' : 'Find episodes'}
                </button>
              </div>

              {searchError && <p className="search-error">{searchError}</p>}

              {results !== null && (
                <div className="episode-results">
                  {results.length === 0 ? (
                    <p className="no-results">No episodes found for that category{selectedYear ? ` in ${selectedYear}` : ''}.</p>
                  ) : (
                    <ul>
                      {results.map((ep) => (
                        <li key={ep.airDate} onClick={() => selectEpisode(ep)}>
                          <strong>{formatDate(ep.airDate)}</strong>
                          <span>{ep.categories.slice(0, 4).join(' · ')}{ep.categories.length > 4 ? '…' : ''}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Show selected episode to non-managing players */}
      {!canManageEpisode && room.selectedEpisode && (
        <div className="episode-selected host-picked">
          <div className="episode-selected-date">
            Episode: {formatDate(room.selectedEpisode.airDate)}
          </div>
          <div className="episode-selected-cats">
            {room.selectedEpisode.categories.slice(0, 6).join(' · ')}
          </div>
        </div>
      )}

      {/* Bottom action */}
      {room.autopilot ? (
        contestants.length < 2 ? (
          <p className="hint">
            Waiting for {2 - contestants.length} more player{2 - contestants.length === 1 ? '' : 's'}…
          </p>
        ) : allReady ? (
          <p className="hint starting-soon">All ready — starting shortly…</p>
        ) : amReady ? (
          <p className="hint">
            You're ready! Waiting for {contestants.filter((p) => !room.readyPlayerIds.includes(p.id)).map((p) => p.name).join(', ')}…
          </p>
        ) : (
          <button className="ready-btn" onClick={markReady}>
            Ready to play!
          </button>
        )
      ) : isHost ? (
        <button onClick={start} disabled={!canStart}>
          {canStart
            ? room.selectedEpisode ? 'Start with selected episode' : 'Start game'
            : `Need 2–4 contestants (have ${contestants.length})`}
        </button>
      ) : (
        <p className="hint">Waiting for the host to start…</p>
      )}
    </section>
  );
}
