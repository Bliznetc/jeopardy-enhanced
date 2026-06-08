import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@shared/protocol';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: false,
  reconnection: true,
});

export function connectSocket(token: string) {
  socket.auth = { token };
  if (socket.connected) socket.disconnect();
  socket.connect();
}

export function disconnectSocket() {
  socket.disconnect();
}
