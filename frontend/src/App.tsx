import { useEffect, useMemo, useState } from "react";
import LandingPage from "./pages/LandingPage";
import NotFoundRoute from "./routes/NotFoundRoute";
import { useNetwork } from "./hooks/useNetwork";
import { useWallet } from "./hooks/useWallet";
<<<<<<< HEAD
import { useAnalytics } from "./hooks/useAnalytics";
import { truncateAddress } from "./utils/formatting";

function App() {
  const { wallet, connect, disconnect, isConnecting, error } = useWallet();
  const [showCelebration, setShowCelebration] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const tutorial = useTutorial(deploymentTutorialSteps);
  const { trackTutorialStarted, trackTutorialCompleted, trackTutorialSkipped } = useAnalytics();

  const handleTutorialComplete = () => {
    tutorial.complete();
    setShowCelebration(true);
    trackTutorialCompleted();
  };

  const handleCelebrationClose = () => {
    setShowCelebration(false);
  };
=======

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname || "/";
}

function App() {
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));
  const { network, setNetwork } = useNetwork();
  const { wallet, connect, disconnect, isConnecting } = useWallet({ network });
>>>>>>> 9702b23d78db15e0072bc972a9a0f1a484f0dd3d

  const handleTutorialSkip = () => {
    trackTutorialSkipped();
  };

  useEffect(() => {
    const handlePopState = () => {
      setPathname(normalizePath(window.location.pathname));
    };

    const handleInternalNavigation = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;

      if (!anchor) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();

      const nextPath = normalizePath(url.pathname);
      if (nextPath !== pathname) {
        window.history.pushState(null, "", `${nextPath}${url.search}${url.hash}`);
        setPathname(nextPath);
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleInternalNavigation);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleInternalNavigation);
    };
  }, [pathname]);

  const page = useMemo(() => {
    if (pathname === "/" || pathname === "/deploy") {
      return (
        <LandingPage
          network={network}
          setNetwork={setNetwork}
          wallet={wallet}
          connect={connect}
          disconnect={disconnect}
          isConnecting={isConnecting}
        />
      );
    }

    return <NotFoundRoute />;
  }, [pathname, network, setNetwork, wallet, connect, disconnect, isConnecting]);

  return page;
}

export default App;
