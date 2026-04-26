import { Router } from "express";

export function createApiRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "agentroom" });
  });

  router.get("/rooms", (_req, res) => {
    res.status(501).json({ error: "Not implemented" });
  });

  router.get("/tasks", (_req, res) => {
    res.status(501).json({ error: "Not implemented" });
  });

  return router;
}
