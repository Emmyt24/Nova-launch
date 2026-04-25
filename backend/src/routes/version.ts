import { Router } from "express";
import { successResponse } from "../utils/response";

const router = Router();

/**
 * GET /api/version
 *
 * Returns the backend integration version and the contract ID it is
 * configured to index. The frontend reads this at boot to detect
 * frontend-backend-contract mismatches and show a compatibility banner.
 *
 * Compatibility rules (checked by the frontend):
 *   - backendVersion must equal VITE_BACKEND_VERSION (if set)
 *   - contractId must equal VITE_FACTORY_CONTRACT_ID
 *   - network must equal VITE_NETWORK
 */
router.get("/", (_req, res) => {
  res.json(
    successResponse({
      backendVersion: process.env.BACKEND_VERSION ?? "0.0.0",
      contractId: process.env.FACTORY_CONTRACT_ID ?? "",
      network: process.env.STELLAR_NETWORK ?? "testnet",
    })
  );
});

export default router;
