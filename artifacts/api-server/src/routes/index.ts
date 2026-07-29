import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import categoriesRouter from "./categories";
import projectsRouter from "./projects";
import mediaRouter from "./media";
import topContentRouter from "./top-content";
import uploadsRouter from "./uploads";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(categoriesRouter);
router.use(projectsRouter);
router.use(mediaRouter);
router.use(topContentRouter);
router.use(uploadsRouter);
router.use(statsRouter);

export default router;
