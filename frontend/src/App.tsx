import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Header } from "./components/Layout";
import { ErrorBoundary, Spinner } from "./components/UI";
import { ConnectButton } from "./components/WalletConnect";

const HomeRoute = lazy(() => import("./routes/HomeRoute"));
const NotFoundRoute = lazy(() => import("./routes/NotFoundRoute"));

function usePathname() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return pathname;
}

function App() {
  const pathname = usePathname();
  const RouteComponent = useMemo(() => {
    if (pathname === "/") {
      return HomeRoute;
    }

    return NotFoundRoute;
  }, [pathname]);

  return (
    <ErrorBoundary>
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>
      <div className="min-h-screen bg-gray-50">
        <Header>
          <ConnectButton />
        </Header>
        <main id="main-content">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16">
                <Spinner size="lg" className="text-gray-500" />
              </div>
            }
          >
            <RouteComponent />
          </Suspense>
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;
