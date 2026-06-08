import { describe, it, expect, beforeEach } from 'vitest';
import { RoomRegistry, Room, generateCode } from './rooms';
import { makeFixtureEpisode } from '../test/fixtures';

const FIXTURE = makeFixtureEpisode();

describe('generateCode', () => {
  it('returns 4-character codes from the safe alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(4);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    }
  });
});

describe('Room', () => {
  let room: Room;
  beforeEach(() => {
    room = new Room('ABCD', 'host-id', 'Host', 'host-id');
  });

  it('starts in lobby phase with the host present', () => {
    expect(room.phase).toBe('lobby');
    expect(room.players.size).toBe(1);
    expect(room.players.get('host-id')?.role).toBe('host');
    expect(room.contestants().length).toBe(0);
  });

  it('adds contestants while in lobby', () => {
    room.addContestant('p1', 'Alice');
    room.addContestant('p2', 'Bob');
    expect(room.contestants().map((p) => p.name)).toEqual(['Alice', 'Bob']);
  });

  it('caps the room at 4 contestants', () => {
    for (let i = 1; i <= 4; i++) room.addContestant(`p${i}`, `Player ${i}`);
    expect(() => room.addContestant('p5', 'Late')).toThrow(/full/i);
  });

  it('rejects empty or whitespace-only names', () => {
    expect(() => room.addContestant('p1', '   ')).toThrow(/Name/);
  });

  it('rejects names longer than 20 characters', () => {
    expect(() => room.addContestant('p1', 'x'.repeat(21))).toThrow(/20/);
  });

  it('trims contestant names', () => {
    room.addContestant('p1', '  Alice  ');
    expect(room.contestants()[0].name).toBe('Alice');
  });

  it('refuses to start without enough contestants', () => {
    room.addContestant('p1', 'Solo');
    expect(() => room.startGame('host-id', FIXTURE)).toThrow(/2/);
  });

  it('only the host can start', () => {
    room.addContestant('p1', 'Alice');
    room.addContestant('p2', 'Bob');
    expect(() => room.startGame('p1', FIXTURE)).toThrow(/host/i);
  });

  it('starts a game with 2+ contestants', () => {
    room.addContestant('p1', 'Alice');
    room.addContestant('p2', 'Bob');
    room.startGame('host-id', FIXTURE);
    expect(room.phase).toBe('show_board');
    room.cleanup();
  });

  it('refuses to start twice', () => {
    room.addContestant('p1', 'Alice');
    room.addContestant('p2', 'Bob');
    room.startGame('host-id', FIXTURE);
    expect(() => room.startGame('host-id', FIXTURE)).toThrow(/already/i);
    room.cleanup();
  });

  it('refuses joins after start', () => {
    room.addContestant('p1', 'Alice');
    room.addContestant('p2', 'Bob');
    room.startGame('host-id', FIXTURE);
    expect(() => room.addContestant('p3', 'Late')).toThrow(/in progress/i);
    room.cleanup();
  });

  it('removePlayer removes a contestant', () => {
    room.addContestant('p1', 'Alice');
    room.addContestant('p2', 'Bob');
    room.removePlayer('p1');
    expect(room.contestants().map((p) => p.name)).toEqual(['Bob']);
  });

  it('setConnected toggles a player flag', () => {
    room.addContestant('p1', 'Alice');
    room.setConnected('p1', false);
    expect(room.players.get('p1')?.connected).toBe(false);
    room.setConnected('p1', true);
    expect(room.players.get('p1')?.connected).toBe(true);
  });

  it('toRoomState returns a serializable snapshot', () => {
    room.addContestant('p1', 'Alice');
    const state = room.toRoomState();
    expect(state).toMatchObject({
      code: 'ABCD',
      phase: 'lobby',
      hostId: 'host-id',
      players: expect.any(Array),
      game: null,
    });
    expect(state.players.length).toBe(2);
  });
});

describe('RoomRegistry', () => {
  let reg: RoomRegistry;
  beforeEach(() => {
    reg = new RoomRegistry();
  });

  it('creates rooms with unique codes', () => {
    const a = reg.create('h1', 'Host A');
    const b = reg.create('h2', 'Host B');
    expect(a.code).not.toBe(b.code);
    expect(reg.size()).toBe(2);
  });

  it('looks up rooms case-insensitively', () => {
    const room = reg.create('h1', 'Host');
    expect(reg.get(room.code.toLowerCase()).code).toBe(room.code);
    expect(reg.has(room.code.toLowerCase())).toBe(true);
  });

  it('throws on missing code', () => {
    expect(() => reg.get('XXXX')).toThrow(/not found/i);
  });

  it('destroys rooms on demand', () => {
    const room = reg.create('h1', 'Host');
    reg.destroy(room.code);
    expect(reg.has(room.code)).toBe(false);
    expect(reg.size()).toBe(0);
  });

  it('rejects creation with empty name', () => {
    expect(() => reg.create('h1', '   ')).toThrow(/Name/);
  });
});
