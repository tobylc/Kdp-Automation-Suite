import { Router, type IRouter } from "express";
import healthRouter from "./health";
import booksRouter from "./books";
import jobsRouter from "./jobs";
import scheduleRouter from "./schedule";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(booksRouter);
router.use(jobsRouter);
router.use(scheduleRouter);
router.use(statsRouter);

export default router;
