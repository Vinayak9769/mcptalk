import { prisma } from "./client.js";

export async function initializeDatabase(): Promise<void> {
  await prisma.$connect();
}
