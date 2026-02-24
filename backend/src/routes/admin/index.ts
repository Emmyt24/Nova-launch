import { Router } from "express";
import statsRouter from "./stats";
import tokensRouter from "./tokens";
import usersRouter from "./users";
import auditRouter from "./audit";

const router = Router();

router.use("/stats", statsRouter);
router.use("/tokens", tokensRouter);
router.use("/users", usersRouter);
router.use("/audit", auditRouter);

export default router;
