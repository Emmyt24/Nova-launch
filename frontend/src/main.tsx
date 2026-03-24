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

const bootErrors = getBootErrors();
const root = createRoot(document.getElementById("root")!);

if (import.meta.env.PROD && bootErrors.length > 0) {
  // In production, render the error screen instead of the app so users
  // see a clear message rather than a blank screen or cryptic JS error.
  root.render(
    <StrictMode>
      <IntegrationBootError errors={bootErrors} />
    </StrictMode>
  );
} else {
  if (bootErrors.length > 0) {
    console.warn("⚠️ Integration boot warnings:\n" + bootErrors.map((e) => `  • ${e}`).join("\n"));
  }

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ErrorBoundary>
    </StrictMode>
  );
}
