import { useState, useCallback } from 'react';

interface UseCopyToClipboardReturn {
    copied: boolean;
    copy: (text: string) => Promise<boolean>;
    reset: () => void;
}

/**
 * Hook for copying text to clipboard with state management
 * Returns copied state and copy function
 */
export function useCopyToClipboard(resetDelay = 2000): UseCopyToClipboardReturn {
    const [copied, setCopied] = useState(false);

    const copy = useCallback(async (text: string): Promise<boolean> => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), resetDelay);
            return true;
        } catch {
            // Fallback for older browsers
            try {
                const el = document.createElement('textarea');
                el.value = text;
                el.style.position = 'fixed';
                el.style.opacity = '0';
                el.setAttribute('aria-hidden', 'true');
                document.body.appendChild(el);
                el.select();
                const success = document.execCommand('copy');
                document.body.removeChild(el);
                
                if (success) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), resetDelay);
                    return true;
                }
                return false;
            } catch {
                return false;
            }
        }
    }, [resetDelay]);

    const reset = useCallback(() => {
        setCopied(false);
    }, []);

    return { copied, copy, reset };
}
