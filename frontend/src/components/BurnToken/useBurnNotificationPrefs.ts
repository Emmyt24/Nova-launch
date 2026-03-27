import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'burn-notifications-enabled';
const DEFAULT_VALUE = true;

function getStoredPref(): boolean {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === null) return DEFAULT_VALUE;
        return stored === 'true';
    } catch {
        return DEFAULT_VALUE;
    }
}

function setStoredPref(value: boolean): void {
    try {
        localStorage.setItem(STORAGE_KEY, String(value));
    } catch (error) {
        console.warn('Failed to save burn notification preference:', error);
    }
}

export function useBurnNotificationPrefs(onChange?: (enabled: boolean) => void) {
    const [enabled, setEnabledState] = useState<boolean>(getStoredPref);

    useEffect(() => {
        const stored = getStoredPref();
        setEnabledState(stored);
    }, []);

    const setEnabled = useCallback(
        (value: boolean) => {
            setStoredPref(value);
            setEnabledState(value);
            onChange?.(value);
        },
        [onChange]
    );

    return { enabled, setEnabled };
}
