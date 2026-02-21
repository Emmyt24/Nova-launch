import { useState, useCallback, memo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './Button';

interface ShareButtonProps {
    tokenName: string;
    tokenSymbol: string;
    tokenAddress: string;
    className?: string;
}

interface ShareOption {
    name: string;
    icon: React.ReactNode;
    action: () => void;
    color: string;
}

export const ShareButton = memo(({ tokenName, tokenSymbol, tokenAddress, className }: ShareButtonProps) => {
    const [showOptions, setShowOptions] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const shareText = `🎉 I just deployed ${tokenName} (${tokenSymbol}) on Nova Launch!\nToken address: ${tokenAddress}`;
    const shareUrl = window.location.href;

    // Close menu on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && showOptions) {
                setShowOptions(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [showOptions]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowOptions(false);
            }
        };
        if (showOptions) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showOptions]);

    const shareOptions: ShareOption[] = [
        {
            name: 'Twitter',
            icon: (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
            ),
            action: () => {
                const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
                window.open(url, '_blank', 'noopener,noreferrer');
                setShowOptions(false);
            },
            color: 'hover:bg-blue-50 hover:text-blue-600',
        },
        {
            name: 'Telegram',
            icon: (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.008-1.252-.241-1.865-.44-.752-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.14.121.099.155.232.171.326.016.093.036.306.02.472z" />
                </svg>
            ),
            action: () => {
                const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
                window.open(url, '_blank', 'noopener,noreferrer');
                setShowOptions(false);
            },
            color: 'hover:bg-sky-50 hover:text-sky-600',
        },
        {
            name: 'LinkedIn',
            icon: (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
            ),
            action: () => {
                const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
                window.open(url, '_blank', 'noopener,noreferrer');
                setShowOptions(false);
            },
            color: 'hover:bg-blue-50 hover:text-blue-700',
        },
        {
            name: 'Copy Link',
            icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            ),
            action: async () => {
                try {
                    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                    // Visual feedback without alert
                    const btn = document.activeElement as HTMLElement;
                    if (btn) btn.blur();
                } catch {
                    // Fallback for older browsers
                    const el = document.createElement('textarea');
                    el.value = `${shareText}\n${shareUrl}`;
                    el.style.position = 'fixed';
                    el.style.opacity = '0';
                    document.body.appendChild(el);
                    el.select();
                    document.execCommand('copy');
                    document.body.removeChild(el);
                }
                setShowOptions(false);
            },
            color: 'hover:bg-gray-100 hover:text-gray-700',
        },
    ];

    const handleShare = useCallback(() => {
        if (navigator.share) {
            navigator
                .share({
                    title: `${tokenName} deployed on Nova Launch!`,
                    text: shareText,
                    url: shareUrl,
                })
                .then(() => setShowOptions(false))
                .catch((err) => {
                    // User cancelled or error - show options if not AbortError
                    if (err.name !== 'AbortError') {
                        setShowOptions(true);
                    }
                });
        } else {
            setShowOptions((prev) => !prev);
        }
    }, [tokenName, shareText, shareUrl]);

    return (
        <div className={`relative ${className || ''}`} ref={menuRef}>
            <Button
                variant="primary"
                onClick={handleShare}
                className="flex items-center justify-center gap-2"
                aria-label="Share your token deployment"
                aria-expanded={showOptions}
                aria-haspopup="menu"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share Success
            </Button>

            <AnimatePresence>
                {showOptions && (
                    <>
                        {/* Options menu */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50"
                            role="menu"
                            aria-label="Share options"
                        >
                            {shareOptions.map((option, index) => (
                                <motion.button
                                    key={option.name}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    onClick={option.action}
                                    className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors ${option.color} first:rounded-t-lg last:rounded-b-lg`}
                                    role="menuitem"
                                >
                                    {option.icon}
                                    {option.name}
                                </motion.button>
                            ))}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
});

ShareButton.displayName = 'ShareButton';
