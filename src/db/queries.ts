import { prisma } from "./client.js";

export type RoomRecord = {
  id: string;
  name: string;
  createdAt: Date;
};

export type MessageRecord = {
  id: string;
  roomId: string;
  agentName: string;
  content: string;
  createdAt: Date;
};

export type FileClaimRecord = {
  id: string;
  roomId: string;
  filePath: string;
  agentName: string;
  claimedAt: Date;
  lastHeartbeat: Date;
};

export type TaskRecord = {
  id: string;
  roomId: string;
  title: string;
  status: string;
  claimedBy: string | null;
  createdAt: Date;
};

export async function createRoom(name: string): Promise<RoomRecord> {
  return prisma.room.create({ data: { name } });
}

export async function getRoom(roomId: string): Promise<RoomRecord | null> {
  return prisma.room.findUnique({ where: { id: roomId } });
}

export async function joinRoom(input: {
  roomId: string;
  agentName: string;
}): Promise<RoomRecord | null> {
  void input.agentName;
  return prisma.room.findUnique({ where: { id: input.roomId } });
}

export async function createMessage(input: {
  roomId: string;
  agentName: string;
  content: string;
}): Promise<MessageRecord> {
  return prisma.message.create({ data: input });
}

export async function getRoomMessages(roomId: string): Promise<MessageRecord[]> {
  return prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" }
  });
}

export async function createFileClaim(input: {
  roomId: string;
  filePath: string;
  agentName: string;
}): Promise<FileClaimRecord> {
  return prisma.fileClaim.create({ data: input });
}

export async function claimFileIfAvailable(input: {
  roomId: string;
  filePath: string;
  agentName: string;
}): Promise<
  | { claimed: true; claim: FileClaimRecord }
  | { claimed: false; existingClaim: FileClaimRecord }
> {
  const existing = await prisma.fileClaim.findFirst({
    where: { roomId: input.roomId, filePath: input.filePath }
  });

  if (existing) {
    return { claimed: false, existingClaim: existing };
  }

  try {
    const claim = await prisma.fileClaim.create({
      data: {
        roomId: input.roomId,
        filePath: input.filePath,
        agentName: input.agentName
      }
    });

    return { claimed: true, claim };
  } catch (error: unknown) {
    const duplicateKey =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";

    if (duplicateKey) {
      const concurrentClaim = await prisma.fileClaim.findFirst({
        where: { roomId: input.roomId, filePath: input.filePath }
      });

      if (concurrentClaim) {
        return { claimed: false, existingClaim: concurrentClaim };
      }
    }

    throw error;
  }
}

export async function releaseFileClaim(input: {
  roomId: string;
  filePath: string;
  agentName?: string;
}): Promise<number> {
  const result = await prisma.fileClaim.deleteMany({
    where: {
      roomId: input.roomId,
      filePath: input.filePath,
      ...(input.agentName ? { agentName: input.agentName } : {})
    }
  });
  return result.count;
}

export async function getFileClaims(roomId: string): Promise<FileClaimRecord[]> {
  return prisma.fileClaim.findMany({
    where: { roomId },
    orderBy: { claimedAt: "asc" }
  });
}

export async function createTask(input: {
  roomId: string;
  title: string;
}): Promise<TaskRecord> {
  return prisma.task.create({
    data: {
      roomId: input.roomId,
      title: input.title,
      status: "open"
    }
  });
}

export async function claimTask(input: {
  taskId: string;
  agentName: string;
}): Promise<TaskRecord> {
  return prisma.task.update({
    where: { id: input.taskId },
    data: {
      claimedBy: input.agentName,
      status: "claimed"
    }
  });
}

export async function claimTaskIfAvailable(input: {
  taskId: string;
  agentName: string;
}): Promise<
  | { claimed: true; task: TaskRecord }
  | { claimed: false; task: TaskRecord | null }
> {
  const claimResult = await prisma.task.updateMany({
    where: {
      id: input.taskId,
      claimedBy: null,
      status: "open"
    },
    data: {
      claimedBy: input.agentName,
      status: "claimed"
    }
  });

  if (claimResult.count === 1) {
    const claimedTask = await prisma.task.findUnique({ where: { id: input.taskId } });
    return { claimed: true, task: claimedTask as TaskRecord };
  }

  const existingTask = await prisma.task.findUnique({ where: { id: input.taskId } });
  return { claimed: false, task: existingTask };
}

export async function completeTask(taskId: string): Promise<TaskRecord> {
  return prisma.task.update({
    where: { id: taskId },
    data: {
      status: "completed"
    }
  });
}

export async function getTasks(roomId: string): Promise<TaskRecord[]> {
  return prisma.task.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" }
  });
}


