import { useEffect, useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  root?: Element | null;
  rootMargin?: string;
  freezeOnceVisible?: boolean;
}

export function useIntersectionObserver<T extends HTMLElement>(
  options: UseIntersectionObserverOptions = {}
): [RefObject<T>, boolean] {
  const {
    threshold = 0,
    root = null,
    rootMargin = '0px',
    freezeOnceVisible = true,
  } = options;

  const elementRef = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);
  const frozen = useRef(false);

  const updateVisibility = useCallback((entries: IntersectionObserverEntry[]) => {
    const entry = entries[0];
    const { isIntersecting } = entry;
    
    if (freezeOnceVisible && frozen.current) {
      return;
    }
    
    if (isIntersecting) {
      setIsVisible(true);
      if (freezeOnceVisible) {
        frozen.current = true;
      }
    } else if (!freezeOnceVisible) {
      setIsVisible(false);
    }
  }, [freezeOnceVisible]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    if (freezeOnceVisible && frozen.current) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(updateVisibility, {
      threshold,
      root,
      rootMargin,
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, root, rootMargin, freezeOnceVisible, updateVisibility]);

  return [elementRef as RefObject<T>, isVisible];
}

/**
 * Hook for lazy loading components with intersection observer
 */
export function useLazyLoad<T extends HTMLElement>(
  options: UseIntersectionObserverOptions = {}
): [RefObject<T>, boolean] {
  return useIntersectionObserver<T>({
    threshold: 0.1,
    rootMargin: '100px',
    freezeOnceVisible: true,
    ...options,
  });
}
