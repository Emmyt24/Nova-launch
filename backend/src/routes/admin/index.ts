import { Router } from "express";
import statsRouter from "./stats";
import tokensRouter from "./tokens";
import usersRouter from "./users";
import auditRouter from "./audit";
import operationalRouter from "./operational";
import backupRouter from "./backup";

const router = Router();

router.use("/stats", statsRouter);
router.use("/tokens", tokensRouter);
router.use("/users", usersRouter);
router.use("/audit", auditRouter);
router.use("/operational", operationalRouter);
router.use("/backup", backupRouter);

export default router;
