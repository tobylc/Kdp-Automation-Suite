import { Router } from "express";
import { getSetupStatus, prepareWorkspace } from "../lib/local-setup";

const router = Router();

router.get("/setup/status", async (_req, res): Promise<void> => {
  const status = await getSetupStatus();
  res.json(status);
});

router.post("/setup/prepare", async (_req, res): Promise<void> => {
  const result = await prepareWorkspace();
  res.json(result);
});

export default router;
