import { useEffect, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from './Modal';
import { Button } from './Button';
import { ShareButton } from './ShareButton';
import { useConfetti } from '../../hooks/useConfetti';
import type { DeploymentResult } from '../../types';
import { truncateAddress, formatDate } from '../../utils/formatting';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    tokenName: string;
    tokenSymbol: string;
    tokenAddress: string;
    /** Optional full deployment result for richer display */
    deploymentResult?: DeploymentResult;
}

// ─── Animation variants ───────────────────────────────────────────────────────

const containerVariants = {
    hidden: { opacity: 0, scale: 0.92, y: 24 },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: {
            type: 'spring',
            stiffness: 300,
            damping: 28,
            staggerChildren: 0.08,
            delayChildren: 0.15,
        },
    },
    exit: {
        opacity: 0,
        scale: 0.95,
        y: 16,
        transition: { duration: 0.2 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 24 } },
};

const checkmarkVariants = {
    hidden: { scale: 0, rotate: -45 },
    visible: {
        scale: 1,
        rotate: 0,
        transition: { type: 'spring', stiffness: 350, damping: 20, delay: 0.1 },
    },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Animated SVG checkmark with enhanced effects - Memoized for performance */
const AnimatedCheckmark = memo(() => {
    return (
        <motion.div
            className="relative flex items-center justify-center"
            variants={checkmarkVariants}
        >
            {/* Multiple pulse rings for depth */}
            <motion.div
                className="absolute w-28 h-28 rounded-full bg-green-400"
                initial={{ scale: 0.8, opacity: 0.4 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
            />
            <motion.div
                className="absolute w-28 h-28 rounded-full bg-green-300"
                initial={{ scale: 0.8, opacity: 0.3 }}
                animate={{ scale: 1.8, opacity: 0 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
            />
            {/* Circle background with gradient */}
            <motion.div 
                className="relative w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-2xl"
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300 }}
            >
                <div className="w-[90px] h-[90px] rounded-full bg-green-100 flex items-center justify-center">
                    <svg
                        className="w-14 h-14 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                        aria-hidden="true"
                    >
                        <motion.path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.35 }}
                        />
                    </svg>
                </div>
            </motion.div>
        </motion.div>
    );
});

AnimatedCheckmark.displayName = 'AnimatedCheckmark';

/** Copy-to-clipboard button with animated feedback - Memoized for performance */
const CopyButton = memo(({ text, label = 'Copy' }: { text: string; label?: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            // Fallback for older browsers
            const el = document.createElement('textarea');
            el.value = text;
            el.style.position = 'fixed';
            el.style.opacity = '0';
            el.setAttribute('aria-hidden', 'true');
            document.body.appendChild(el);
            el.select();
            try {
                document.execCommand('copy');
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch {
                console.error('Failed to copy text');
            } finally {
                document.body.removeChild(el);
            }
        }
    }, [text]);

    return (
        <motion.button
            onClick={handleCopy}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all
                       text-gray-500 hover:text-blue-600 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500"
            title={`Copy ${label}`}
            aria-label={copied ? 'Copied!' : `Copy ${label}`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
        >
            <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                    <motion.span
                        key="check"
                        initial={{ scale: 0.5, opacity: 0, y: 5 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.5, opacity: 0, y: -5 }}
                        transition={{ duration: 0.2, type: 'spring', stiffness: 300 }}
                        className="flex items-center gap-1 text-green-600"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                    </motion.span>
                ) : (
                    <motion.span
                        key="copy"
                        initial={{ scale: 0.5, opacity: 0, y: 5 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.5, opacity: 0, y: -5 }}
                        transition={{ duration: 0.2, type: 'spring', stiffness: 300 }}
                        className="flex items-center gap-1"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                    </motion.span>
                )}
            </AnimatePresence>
        </motion.button>
    );
});

CopyButton.displayName = 'CopyButton';

// ─── Main component ───────────────────────────────────────────────────────────

export function SuccessModal({
    isOpen,
    onClose,
    tokenName,
    tokenSymbol,
    tokenAddress,
    deploymentResult,
}: SuccessModalProps) {
    const { fire: fireConfetti, stop: stopConfetti } = useConfetti();

    // Fire confetti when modal opens; stop when it closes
    useEffect(() => {
        if (isOpen) {
            // Small delay so the modal entrance animation plays first
            const t = setTimeout(fireConfetti, 350);
            return () => {
                clearTimeout(t);
                stopConfetti();
            };
        } else {
            stopConfetti();
        }
    }, [isOpen, fireConfetti, stopConfetti]);

    const explorerUrl = deploymentResult
        ? `https://stellar.expert/explorer/testnet/contract/${tokenAddress}`
        : null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="" hideHeader size="md">
            {/* We manage our own animated content inside the Modal's content slot */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="success-content"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="py-4 text-center"
                        role="status"
                        aria-live="polite"
                        aria-label={`Token ${tokenName} deployed successfully`}
                    >
                        {/* ── Close button (top-right) ── */}
                        <motion.button
                            variants={itemVariants}
                            onClick={onClose}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-1 focus-visible:ring-2 focus-visible:ring-blue-500"
                            aria-label="Close"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </motion.button>

                        {/* ── Animated checkmark ── */}
                        <motion.div variants={itemVariants} className="mb-6 flex justify-center">
                            <AnimatedCheckmark />
                        </motion.div>

                        {/* ── Title ── */}
                        <motion.h2
                            variants={itemVariants}
                            className="text-2xl font-bold text-gray-900 mb-2"
                        >
                            🎉 Token Deployed Successfully!
                        </motion.h2>

                        {/* ── Subtitle ── */}
                        <motion.p variants={itemVariants} className="text-gray-500 mb-6">
                            Your token{' '}
                            <span className="font-semibold text-gray-800">{tokenName}</span>{' '}
                            <span className="text-gray-400">({tokenSymbol})</span> is live on the Stellar network.
                        </motion.p>

                        {/* ── Token address card ── */}
                        <motion.div
                            variants={itemVariants}
                            className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4 mb-4 text-left"
                            whileHover={{ scale: 1.01, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                            transition={{ type: 'spring', stiffness: 300 }}
                        >
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                Token Address
                            </p>
                            <div className="flex items-center gap-2">
                                <code className="text-sm text-gray-800 font-mono break-all flex-1 select-all">
                                    {tokenAddress}
                                </code>
                                <CopyButton text={tokenAddress} label="token address" />
                            </div>
                        </motion.div>

                        {/* ── Deployment details (if available) ── */}
                        {deploymentResult && (
                            <motion.div
                                variants={itemVariants}
                                className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-left space-y-3"
                            >
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                    Deployment Details
                                </p>

                                {/* Transaction hash */}
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-gray-500 shrink-0">Tx Hash</span>
                                    <div className="flex items-center gap-1 min-w-0">
                                        <code className="text-xs text-gray-700 font-mono truncate">
                                            {truncateAddress(deploymentResult.transactionHash, 10, 8)}
                                        </code>
                                        <CopyButton text={deploymentResult.transactionHash} label="transaction hash" />
                                    </div>
                                </div>

                                {/* Fee */}
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">Total Fee</span>
                                    <span className="text-xs font-medium text-gray-800">
                                        {deploymentResult.totalFee} XLM
                                    </span>
                                </div>

                                {/* Timestamp */}
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">Deployed At</span>
                                    <span className="text-xs font-medium text-gray-800">
                                        {formatDate(deploymentResult.timestamp)}
                                    </span>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Action buttons ── */}
                        <motion.div
                            variants={itemVariants}
                            className="flex flex-col sm:flex-row gap-3 justify-center"
                        >
                            {/* Share */}
                            <ShareButton
                                tokenName={tokenName}
                                tokenSymbol={tokenSymbol}
                                tokenAddress={tokenAddress}
                            />

                            {/* View on explorer */}
                            {explorerUrl && (
                                <a
                                    href={explorerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 px-4 py-2 text-base font-medium rounded-lg border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors focus-visible:ring-2 focus-visible:ring-gray-500"
                                    aria-label="View token on Stellar Expert explorer"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    View on Explorer
                                </a>
                            )}

                            {/* Close */}
                            <Button
                                variant="outline"
                                onClick={onClose}
                                aria-label="Close success dialog"
                            >
                                Done
                            </Button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Modal>
    );
}
