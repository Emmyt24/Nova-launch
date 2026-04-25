import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/UI/ErrorBoundary";
import { IntegrationBootError } from "./components/IntegrationBootError";
import { initPWA } from "./services/pwa";
import { setupGlobalErrorHandling } from "./utils/errors";
import { initPerformanceMonitoring } from "./utils/performance";
import { getBootErrors } from "./config/env";
import { ToastProvider } from "./providers/ToastProvider";
import type { CompatibilityInfo } from "./components/IntegrationVersionBanner";

if (import.meta.env.PROD) {
  initPWA().catch((error) => {
    console.warn("PWA initialization failed:", error);
  });
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  });
}

setupGlobalErrorHandling();

if (import.meta.env.PROD) {
  initPerformanceMonitoring();
}

/** Fetch backend version and compare against frontend config. */
async function checkCompatibility(): Promise<CompatibilityInfo> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "";
  if (!backendUrl) return { status: "ok", blockWrites: false };

  try {
    const res = await fetch(`${backendUrl}/api/version`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { status: "warning", message: "Backend version endpoint unavailable.", blockWrites: false };

    const json = await res.json();
    const { contractId, network } = json.data ?? json;

    const frontendContract = import.meta.env.VITE_FACTORY_CONTRACT_ID ?? "";
    const frontendNetwork = import.meta.env.VITE_NETWORK ?? "testnet";

    if (network !== frontendNetwork) {
      return {
        status: "error",
        message: `Network mismatch: frontend is on "${frontendNetwork}" but backend is on "${network}".`,
        blockWrites: true,
      };
    }
    if (contractId && frontendContract && contractId !== frontendContract) {
      return {
        status: "warning",
        message: `Contract ID mismatch: frontend uses "${frontendContract.slice(0, 8)}…" but backend indexes "${contractId.slice(0, 8)}…". Data may be stale.`,
        blockWrites: false,
      };
    }
    return { status: "ok", blockWrites: false };
  } catch {
    // Non-fatal — backend may not be deployed yet
    return { status: "warning", message: "Could not reach backend to verify compatibility.", blockWrites: false };
  }
}

const bootErrors = getBootErrors();
const root = createRoot(document.getElementById("root")!);

if (import.meta.env.PROD && bootErrors.length > 0) {
  root.render(
    <StrictMode>
      <IntegrationBootError errors={bootErrors} />
    </StrictMode>
  );
} else {
  if (bootErrors.length > 0) {
    console.warn("⚠️ Integration boot warnings:\n" + bootErrors.map((e) => `  • ${e}`).join("\n"));
  }

  // Fetch compatibility info before first render so the banner is available immediately
  checkCompatibility().then((compatInfo) => {
    root.render(
      <StrictMode>
        <ErrorBoundary>
          <ToastProvider>
            <App compatibilityInfo={compatInfo} />
          </ToastProvider>
        </ErrorBoundary>
      </StrictMode>
    );
  });
}
