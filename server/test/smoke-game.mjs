// One-shot smoke test: drives the server via real socket clients through a
// minimum playable game flow (start → pick → buzz → judge → score).
//
// Run via: node server/test/smoke-game.mjs

import { io as ClientIO } from 'socket.io-client';

const URL = process.env.URL ?? 'http://127.0.0.1:3001';

function emit(socket, event, data) {
  return new Promise((resolve) => socket.emit(event, data, resolve));
}

function connect() {
  return ClientIO(URL, { transports: ['websocket'], reconnection: false, forceNew: true });
}

async function ready(s) {
  if (s.connected) return;
  await new Promise((resolve) => s.once('connect', resolve));
}

const host = connect();
const alice = connect();
const bob = connect();

let hostState = null;
let hostExtras = null;
host.on('room_state', (s) => (hostState = s));
host.on('host_state', (h) => (hostExtras = h));

async function waitFor(predicate, label, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (hostState && predicate(hostState)) return hostState;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timeout: ${label}`);
}

try {
  await Promise.all([ready(host), ready(alice), ready(bob)]);

  const created = await emit(host, 'create_room', { name: 'Host' });
  const code = created.data.code;
  console.log('Created room', code);

  await emit(alice, 'join_room', { code, name: 'Alice' });
  await emit(bob, 'join_room', { code, name: 'Bob' });
  console.log('Both contestants joined');

  const start = await emit(host, 'start_game', { code });
  if (!start.ok) throw new Error('start failed: ' + start.error);

  await waitFor((s) => s.phase === 'show_board' && !!s.game, 'show_board');
  const game0 = hostState.game;
  console.log('Phase: show_board, picker:', game0.currentPicker, 'round:', game0.round);

  const pickerSocket = game0.currentPicker === alice.id ? alice : bob;

  // Find a non-DD clue to make the smoke deterministic
  // (we don't have access to isDailyDouble for cells until clicked, so
  //  pick the lowest tier in each category until a non-DD lands).
  const cat = game0.round1.categories[0];
  const value = game0.round1.valueTiers[0];
  await emit(pickerSocket, 'pick_clue', { code, round: 1, category: cat, value });

  await waitFor(
    (s) => s.phase === 'clue_reading' || s.phase === 'daily_double_wager',
    'clue_reading'
  );

  if (hostState.phase === 'daily_double_wager') {
    console.log('Landed on a DD — running DD path');
    await emit(pickerSocket, 'submit_wager', { code, amount: 100 });
    await waitFor((s) => s.phase === 'clue_reading', 'clue_reading after DD wager');
    await emit(host, 'arm_buzzers', { code });
    await waitFor((s) => s.phase === 'answering', 'answering (DD)');
    await emit(pickerSocket, 'submit_answer', { code, text: 'dd answer' });
    await waitFor((s) => s.phase === 'judging', 'judging (DD)');
    await emit(host, 'judge', { code, correct: true });
    await waitFor((s) => s.phase === 'show_board', 'show_board after DD');
    console.log('DD path complete. Scores:', hostState.game.scores);
    console.log('SUCCESS');
    process.exit(0);
  }

  console.log('Clue text:', hostState.game.currentClue.clueText.slice(0, 60), '…');
  console.log('Host sees response:', hostExtras?.currentClueResponse?.slice(0, 60), '…');

  await emit(host, 'arm_buzzers', { code });
  await waitFor((s) => s.phase === 'buzz_open', 'buzz_open');

  await emit(alice, 'buzz', { code });
  await waitFor((s) => s.phase === 'answering' && s.game.buzzedIn === alice.id, 'answering');

  await emit(alice, 'submit_answer', { code, text: 'alice typed this' });
  await waitFor((s) => s.phase === 'judging', 'judging');
  console.log('Host saw answer text:', hostExtras?.currentBuzzedAnswerText);

  await emit(host, 'judge', { code, correct: true });
  await waitFor((s) => s.phase === 'show_board', 'show_board after judge');
  console.log('Picker is now:', hostState.game.currentPicker);
  console.log('Scores:', hostState.game.scores);

  if (hostState.game.scores[alice.id] !== value) {
    throw new Error(`Expected alice score ${value}, got ${hostState.game.scores[alice.id]}`);
  }

  console.log('SUCCESS — full game-flow smoke test passed.');
  process.exit(0);
} catch (e) {
  console.error('FAIL:', e.message);
  console.error('  hostState.phase:', hostState?.phase);
  process.exit(1);
} finally {
  for (const s of [host, alice, bob]) s.disconnect();
}
