import { useState, useCallback, useEffect, useRef } from 'react';
import { TransactionMonitor, type TransactionStatusUpdate } from '../services/transactionMonitor';

interface UseTransactionMonitorReturn {
    monitoring: boolean;
    status: 'pending' | 'success' | 'failed' | 'timeout' | null;
    progress: number;
    estimatedTimeMs?: number;
    error: string | null;
    ledger?: number;
    startMonitoring: (hash: string) => void;
    stopMonitoring: () => void;
}

const ESTIMATED_CONFIRMATION_TIME = 10000; // 10 seconds average

export function useTransactionMonitor(): UseTransactionMonitorReturn {
    const [monitoring, setMonitoring] = useState(false);
    const [status, setStatus] = useState<'pending' | 'success' | 'failed' | 'timeout' | null>(null);
    const [progress, setProgress] = useState(0);
    const [estimatedTimeMs, setEstimatedTimeMs] = useState<number | undefined>();
    const [error, setError] = useState<string | null>(null);
    const [ledger, setLedger] = useState<number | undefined>();
    
    const monitorRef = useRef<TransactionMonitor | null>(null);
    const startTimeRef = useRef<number>(0);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Initialize monitor on mount
    useEffect(() => {
        monitorRef.current = new TransactionMonitor();
        
        return () => {
            if (monitorRef.current) {
                monitorRef.current.destroy();
            }
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
            }
        };
    }, []);

    const stopMonitoring = useCallback(() => {
        setMonitoring(false);
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
    }, []);

    const updateProgress = useCallback(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const progressPercent = Math.min(90, (elapsed / ESTIMATED_CONFIRMATION_TIME) * 90);
        setProgress(progressPercent);
        
        const remaining = Math.max(0, ESTIMATED_CONFIRMATION_TIME - elapsed);
        setEstimatedTimeMs(remaining);
    }, []);

    const handleStatusUpdate = useCallback((update: TransactionStatusUpdate) => {
        setStatus(update.status);
        
        if (update.status === 'success') {
            setProgress(100);
            setEstimatedTimeMs(0);
            if (update.ledger) {
                setLedger(update.ledger);
            }
            stopMonitoring();
        } else if (update.status === 'failed' || update.status === 'timeout') {
            if (update.error) {
                setError(update.error);
            }
            stopMonitoring();
        }
    }, [stopMonitoring]);

    const handleError = useCallback((err: Error) => {
        console.error('Transaction monitoring error:', err);
        // Don't stop monitoring on transient errors
        // The monitor will retry automatically
    }, []);

    const startMonitoring = useCallback((hash: string) => {
        if (!monitorRef.current) {
            console.error('Transaction monitor not initialized');
            return;
        }

        setMonitoring(true);
        setStatus('pending');
        setProgress(0);
        setError(null);
        setLedger(undefined);
        startTimeRef.current = Date.now();
        setEstimatedTimeMs(ESTIMATED_CONFIRMATION_TIME);

        // Start progress animation
        progressIntervalRef.current = setInterval(updateProgress, 500);

        // Start monitoring with callbacks
        monitorRef.current.startMonitoring(hash, handleStatusUpdate, handleError);
    }, [handleStatusUpdate, handleError, updateProgress]);

    return {
        monitoring,
        status,
        progress,
        estimatedTimeMs,
        error,
        ledger,
        startMonitoring,
        stopMonitoring,
    };
}
