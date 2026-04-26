import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Application, Request, Response } from "express";
import { z } from "zod";
import {
  claimFileIfAvailable,
  claimTaskIfAvailable,
  completeTask,
  createMessage,
  createRoom,
  createTask,
  getFileClaims,
  getRoom,
  getRoomMessages,
  getTasks,
  joinRoom,
  releaseFileClaim
} from "../db/queries.js";
import { emitGlobalEvent, emitRoomEvent } from "../socket/events.js";
    
type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type CreateRoomInput = { name: string };
type JoinRoomInput = { roomId: string; agentName: string };
type PostMessageInput = { roomId: string; agentName: string; content: string };
type ReadRoomInput = { roomId: string };
type ClaimFileInput = { roomId: string; filePath: string; agentName: string };
type ReleaseFileInput = { roomId: string; filePath: string; agentName: string };
type GetFileClaimsInput = { roomId: string };
type CreateTaskInput = { roomId: string; title: string };
type ClaimTaskInput = { taskId: string; agentName: string };
type CompleteTaskInput = { taskId: string };
type GetTasksInput = { roomId: string };

function okResult(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }]
  };
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true
  };
}

function unknownErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

function isPrismaRecordNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2025"
  );
}

export async function create_room(input: CreateRoomInput): Promise<ToolResult> {
  try {
    const name = input.name.trim();
    if (!name) {
      return errorResult("Room name is required.");
    }

    const room = await createRoom(name);
    emitGlobalEvent("room_created", {
      roomId: room.id,
      roomName: room.name,
      createdAt: room.createdAt.toISOString()
    });
    return okResult({ room });
  } catch (error: unknown) {
    return errorResult(unknownErrorMessage(error));
  }
}

export async function join_room(input: JoinRoomInput): Promise<ToolResult> {
  try {
    const room = await joinRoom(input);
    if (!room) {
      return errorResult("Room not found.");
    }

    emitRoomEvent(room.id, "room_joined", {
      roomId: room.id,
      agentName: input.agentName
    });

    return okResult({ joined: true, room, agentName: input.agentName });
  } catch (error: unknown) {
    return errorResult(unknownErrorMessage(error));
  }
}

export async function post_message(input: PostMessageInput): Promise<ToolResult> {
  try {
    const room = await getRoom(input.roomId);
    if (!room) {
      return errorResult("Room not found.");
    }

    const content = input.content.trim();
    if (!content) {
      return errorResult("Message content is required.");
    }

    const message = await createMessage({
      roomId: input.roomId,
      agentName: input.agentName,
      content
    });

    emitRoomEvent(input.roomId, "message_posted", {
      roomId: input.roomId,
      messageId: message.id,
      agentName: message.agentName,
      content: message.content,
      createdAt: message.createdAt.toISOString()
    });

    return okResult({ message });
  } catch (error: unknown) {
    return errorResult(unknownErrorMessage(error));
  }
}

export async function read_room(input: ReadRoomInput): Promise<ToolResult> {
  try {
    const room = await getRoom(input.roomId);
    if (!room) {
      return errorResult("Room not found.");
    }

    const messages = await getRoomMessages(input.roomId);
    return okResult({ room, messages });
  } catch (error: unknown) {
    return errorResult(unknownErrorMessage(error));
  }
}

export async function claim_file(input: ClaimFileInput): Promise<ToolResult> {
  try {
    const room = await getRoom(input.roomId);
    if (!room) {
      return errorResult("Room not found.");
    }

    const filePath = input.filePath.trim();
    if (!filePath) {
      return errorResult("filePath is required.");
    }

    const result = await claimFileIfAvailable({
      roomId: input.roomId,
      filePath,
      agentName: input.agentName
    });

    if (!result.claimed) {
      return errorResult(
        `File is already claimed by ${result.existingClaim.agentName}.`
      );
    }

    emitRoomEvent(input.roomId, "file_claimed", {
      roomId: input.roomId,
      filePath: result.claim.filePath,
      agentName: result.claim.agentName,
      claimedAt: result.claim.claimedAt.toISOString()
    });

    return okResult({ claim: result.claim });
  } catch (error: unknown) {
    return errorResult(unknownErrorMessage(error));
  }
}

export async function release_file(input: ReleaseFileInput): Promise<ToolResult> {
  try {
    const room = await getRoom(input.roomId);
    if (!room) {
      return errorResult("Room not found.");
    }

    const releasedCount = await releaseFileClaim({
      roomId: input.roomId,
      filePath: input.filePath,
      agentName: input.agentName
    });

    if (releasedCount > 0) {
      emitRoomEvent(input.roomId, "file_released", {
        roomId: input.roomId,
        filePath: input.filePath,
        agentName: input.agentName
      });
    }

    return okResult({ released: releasedCount > 0, releasedCount });
  } catch (error: unknown) {
    return errorResult(unknownErrorMessage(error));
  }
}

export async function get_file_claims(input: GetFileClaimsInput): Promise<ToolResult> {
  try {
    const room = await getRoom(input.roomId);
    if (!room) {
      return errorResult("Room not found.");
    }

    const claims = await getFileClaims(input.roomId);
    return okResult({ claims });
  } catch (error: unknown) {
    return errorResult(unknownErrorMessage(error));
  }
}

export async function create_task(input: CreateTaskInput): Promise<ToolResult> {
  try {
    const room = await getRoom(input.roomId);
    if (!room) {
      return errorResult("Room not found.");
    }

    const title = input.title.trim();
    if (!title) {
      return errorResult("Task title is required.");
    }

    const task = await createTask({ roomId: input.roomId, title });

    emitRoomEvent(input.roomId, "task_created", {
      roomId: input.roomId,
      taskId: task.id,
      title: task.title,
      status: task.status,
      createdAt: task.createdAt.toISOString()
    });

    return okResult({ task });
  } catch (error: unknown) {
    return errorResult(unknownErrorMessage(error));
  }
}

export async function claim_task(input: ClaimTaskInput): Promise<ToolResult> {
  try {
    const result = await claimTaskIfAvailable(input);

    if (!result.claimed) {
      if (!result.task) {
        return errorResult("Task not found.");
      }

      return errorResult(
        `Task is not claimable. Current status: ${result.task.status}, claimedBy: ${result.task.claimedBy ?? "none"}.`
      );
    }

    emitRoomEvent(result.task.roomId, "task_claimed", {
      roomId: result.task.roomId,
      taskId: result.task.id,
      claimedBy: result.task.claimedBy,
      status: result.task.status
    });

    return okResult({ task: result.task });
  } catch (error: unknown) {
    return errorResult(unknownErrorMessage(error));
  }
}

export async function complete_task(input: CompleteTaskInput): Promise<ToolResult> {
  try {
    const task = await completeTask(input.taskId);

    emitRoomEvent(task.roomId, "task_completed", {
      roomId: task.roomId,
      taskId: task.id,
      status: task.status,
      claimedBy: task.claimedBy
    });

    return okResult({ task });
  } catch (error: unknown) {
    if (isPrismaRecordNotFound(error)) {
      return errorResult("Task not found.");
    }

    return errorResult(unknownErrorMessage(error));
  }
}

export async function get_tasks(input: GetTasksInput): Promise<ToolResult> {
  try {
    const room = await getRoom(input.roomId);
    if (!room) {
      return errorResult("Room not found.");
    }

    const tasks = await getTasks(input.roomId);
    return okResult({ tasks });
  } catch (error: unknown) {
    return errorResult(unknownErrorMessage(error));
  }
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "agentroom",
    version: "1.0.0"
  });

  server.registerTool(
    "create_room",
    { description: "Create a room", inputSchema: { name: z.string() } },
    (input) => create_room(input as CreateRoomInput)
  );

  server.registerTool(
    "join_room",
    {
      description: "Join a room",
      inputSchema: { roomId: z.string(), agentName: z.string() }
    },
    (input) => join_room(input as JoinRoomInput)
  );

  server.registerTool(
    "post_message",
    {
      description: "Post a message to a room",
      inputSchema: { roomId: z.string(), agentName: z.string(), content: z.string() }
    },
    (input) => post_message(input as PostMessageInput)
  );

  server.registerTool(
    "read_room",
    { description: "Read room messages", inputSchema: { roomId: z.string() } },
    (input) => read_room(input as ReadRoomInput)
  );

  server.registerTool(
    "claim_file",
    {
      description: "Claim a file in a room",
      inputSchema: { roomId: z.string(), filePath: z.string(), agentName: z.string() }
    },
    (input) => claim_file(input as ClaimFileInput)
  );

  server.registerTool(
    "release_file",
    {
      description: "Release a file claim",
      inputSchema: { roomId: z.string(), filePath: z.string(), agentName: z.string() }
    },
    (input) => release_file(input as ReleaseFileInput)
  );

  server.registerTool(
    "get_file_claims",
    { description: "Get file claims for a room", inputSchema: { roomId: z.string() } },
    (input) => get_file_claims(input as GetFileClaimsInput)
  );

  server.registerTool(
    "create_task",
    {
      description: "Create a task",
      inputSchema: { roomId: z.string(), title: z.string() }
    },
    (input) => create_task(input as CreateTaskInput)
  );

  server.registerTool(
    "claim_task",
    {
      description: "Claim a task",
      inputSchema: { taskId: z.string(), agentName: z.string() }
    },
    (input) => claim_task(input as ClaimTaskInput)
  );

  server.registerTool(
    "complete_task",
    { description: "Complete a task", inputSchema: { taskId: z.string() } },
    (input) => complete_task(input as CompleteTaskInput)
  );

  server.registerTool(
    "get_tasks",
    { description: "Get tasks for a room", inputSchema: { roomId: z.string() } },
    (input) => get_tasks(input as GetTasksInput)
  );

  return server;
}

let mcpStarted = false;

type McpSseSession = {
  server: McpServer;
  transport: SSEServerTransport; //Todo replace SSE, deprecated
};

const sseSessions = new Map<string, McpSseSession>();

function getSessionId(req: Request): string | null {
  const value = req.query.sessionId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function registerMcpSseRoutes(app: Application): void {
  if (mcpStarted) {
    return;
  }

  app.get("/mcp/sse", async (_req: Request, res: Response) => {
    try {
      const server = createMcpServer();
      const transport = new SSEServerTransport("/mcp/messages", res);

      sseSessions.set(transport.sessionId, { server, transport });

      const cleanup = () => {
        sseSessions.delete(transport.sessionId);
      };

      transport.onclose = cleanup;
      transport.onerror = cleanup;

      await server.connect(transport);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to start MCP SSE session";
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  });

  app.post("/mcp/messages", async (req: Request, res: Response) => {
    const sessionId = getSessionId(req);

    if (!sessionId) {
      res.status(400).json({ error: "Missing sessionId query parameter." });
      return;
    }

    const session = sseSessions.get(sessionId);

    if (!session) {
      res.status(404).json({ error: "MCP session not found." });
      return;
    }

    try {
      await session.transport.handlePostMessage(req, res, req.body);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to handle MCP message";
      if (!res.headersSent) {
        res.status(500).json({ error: message });
      }
    }
  });

  mcpStarted = true;
}