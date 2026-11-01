import { WebSocket } from 'ws';

export function send(ws: WebSocket, msg: any): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
