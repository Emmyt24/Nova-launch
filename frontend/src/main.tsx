import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/UI/ErrorBoundary";
import { initPWA } from "./services/pwa";
import { setupGlobalErrorHandling } from "./utils/errors";
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

// Initialize global error handling and logging
setupGlobalErrorHandling();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)
