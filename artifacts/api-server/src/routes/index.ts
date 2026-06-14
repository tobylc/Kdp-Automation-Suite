import { Router, type IRouter } from "express";
import healthRouter from "./health";
import booksRouter from "./books";
import aiProviderSettingsRouter from "./aiProviderSettings";
import jobsRouter from "./jobs";
import scheduleRouter from "./schedule";
import statsRouter from "./stats";
import setupRouter from "./setup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(booksRouter);
router.use(jobsRouter);
router.use(scheduleRouter);
router.use(statsRouter);
router.use(setupRouter);
router.use(aiProviderSettingsRouter);

export default router;
