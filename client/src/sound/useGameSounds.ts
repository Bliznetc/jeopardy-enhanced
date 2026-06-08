import { useEffect, useRef } from 'react';
import type { RoomState } from '@shared/protocol';
import { sound } from './SoundEngine';

// Diffs successive RoomStates and fires the appropriate sound on each edge.
export function useGameSounds(room: RoomState | null, me: string | null) {
  const prev = useRef<RoomState | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = room;
    if (!room?.game) return;
    const g = room.game;
    const pg = before?.game ?? null;

    // Board cell selected (a new clue appeared).
    if (g.currentClue && (!pg || !pg.currentClue)) {
      sound.play(g.currentClue.isDailyDouble ? 'dailyDouble' : 'select');
    }

    // Someone buzzed in.
    if (g.buzzedIn && pg && pg.buzzedIn !== g.buzzedIn) {
      sound.play('buzz');
    }

    // Score change => correct/wrong (compare the answerer's score delta).
    if (pg) {
      for (const id of Object.keys(g.scores)) {
        const d = (g.scores[id] ?? 0) - (pg.scores[id] ?? 0);
        if (d > 0) sound.play('correct');
        else if (d < 0) sound.play('wrong');
      }
    }

    // Buzz/answer window expired with no resolution.
    if (before?.phase === 'buzz_open' && room.phase === 'clue_closed') {
      sound.play('timeUp');
    }

    // Round advanced.
    if (pg && g.round !== pg.round) {
      sound.play(g.round === 3 ? 'finalThink' : 'roundStart');
    }

    // Final Jeopardy clue revealed.
    if (room.phase === 'fj_clue' && before?.phase !== 'fj_clue') {
      sound.play('finalThink');
    }

    // Game over.
    if (room.phase === 'game_over' && before?.phase !== 'game_over') {
      sound.play('gameOver');
    }
  }, [room, me]);
}
