import { Router } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
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

/** Serve the start.sh script so users can download it with one curl command */
router.get("/setup/start.sh", (_req, res): void => {
  try {
    const scriptPath = resolve(process.cwd(), "start.sh");
    const script = readFileSync(scriptPath, "utf-8");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="start.sh"');
    res.send(script);
  } catch {
    res.status(404).json({ error: "start.sh not found" });
  }
});

export default router;
