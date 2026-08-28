import { Router, type IRouter } from "express";
import healthRouter from "./health";
import progressRouter from "./progress";

const router: IRouter = Router();

router.use(healthRouter);
router.use(progressRouter);

export default router;
