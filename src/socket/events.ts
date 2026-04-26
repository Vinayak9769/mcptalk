import type { Server, Socket } from "socket.io";

let socketServer: Server | null = null;

export function setSocketServer(io: Server): void {
  socketServer = io;
}

export function emitRoomEvent(
  roomId: string,
  eventName: string,
  payload: Record<string, unknown>
): void {
  if (!socketServer) {
    return;
  }

  socketServer.to(roomId).emit(eventName, payload);
}

export function emitGlobalEvent(
  eventName: string,
  payload: Record<string, unknown>
): void {
  if (!socketServer) {
    return;
  }

  socketServer.emit(eventName, payload);
}

export function registerSocketEvents(io: Server): void {
  setSocketServer(io);

  io.on("connection", (socket: Socket) => {
    socket.emit("connected", { message: "Connected to agentroom." });

    socket.on("join_room", (roomId: string) => {
      socket.join(roomId);
      socket.emit("joined_room", { roomId });
    });

    socket.on("disconnect", () => {});
  });
}
