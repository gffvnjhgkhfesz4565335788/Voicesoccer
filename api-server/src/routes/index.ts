import { Router, type IRouter } from "express";
import healthRouter from "./health";
import geminiLiveRouter from "./gemini-live";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/gemini-live", geminiLiveRouter);

export default router;
