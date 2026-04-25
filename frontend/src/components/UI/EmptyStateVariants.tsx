import React from 'react';
import { EmptyState, EmptyStateIcons } from './EmptyState';

interface EmptyStateVariantProps {
    onAction?: () => void;
    onSecondaryAction?: () => void;
    onRetry?: () => void;
    className?: string;
}

export function NoTokensEmptyState({ onAction, className }: EmptyStateVariantProps) {
    return (
        <EmptyState
            icon={<EmptyStateIcons.NoTokens />}
            title="No tokens deployed yet"
            description="Start your journey by deploying your first token on the Stellar network. It only takes a few minutes!"
            action={
                onAction
                    ? {
                          label: 'Deploy Your First Token',
                          onClick: onAction,
                          variant: 'primary',
                      }
                    : undefined
            }
            className={className}
        />
    );
}

export function NoWalletEmptyState({ onAction, onSecondaryAction, className }: EmptyStateVariantProps) {
    return (
        <EmptyState
            icon={<EmptyStateIcons.NoWallet />}
            title="Wallet not connected"
            description="Connect your Stellar wallet to deploy tokens, view your transaction history, and manage your assets."
            action={
                onAction
                    ? {
                          label: 'Connect Wallet',
                          onClick: onAction,
                          variant: 'primary',
                      }
                    : undefined
            }
            secondaryAction={
                onSecondaryAction
                    ? {
                          label: 'Learn More',
                          onClick: onSecondaryAction,
                      }
                    : undefined
            }
            className={className}
        />
    );
}

export function NoSearchResultsEmptyState({ 
    searchQuery, 
    onClear, 
    className 
}: { 
    searchQuery?: string; 
    onClear?: () => void; 
    className?: string;
}) {
    return (
        <EmptyState
            icon={<EmptyStateIcons.NoSearch />}
            title="No results found"
            description={
                searchQuery
                    ? `We couldn't find any tokens matching "${searchQuery}". Try adjusting your search terms.`
                    : "No tokens match your current filters. Try adjusting your search criteria."
            }
            action={
                onClear
                    ? {
                          label: 'Clear Search',
                          onClick: onClear,
                          variant: 'outline',
                      }
                    : undefined
            }
            className={className}
        />
    );
}

export function NoConnectionEmptyState({ onRetry, className }: EmptyStateVariantProps) {
    return (
        <EmptyState
            icon={<EmptyStateIcons.NoConnection />}
            title="No network connection"
            description="Unable to connect to the Stellar network. Please check your internet connection and try again."
            action={
                onRetry
                    ? {
                          label: 'Retry Connection',
                          onClick: onRetry,
                          variant: 'primary',
                      }
                    : undefined
            }
            className={className}
        />
    );
}

export function NoMetadataEmptyState({ onAction, className }: EmptyStateVariantProps) {
    return (
        <EmptyState
            icon={<EmptyStateIcons.NoMetadata />}
            title="No metadata available"
            description="Token metadata could not be loaded. This might be due to network issues or the token not having metadata configured."
            action={
                onAction
                    ? {
                          label: 'Refresh',
                          onClick: onAction,
                          variant: 'outline',
                      }
                    : undefined
            }
            className={className}
        />
    );
}

export function ErrorEmptyState({ 
    title = "Something went wrong",
    description = "An unexpected error occurred. Please try again or contact support if the problem persists.",
    onRetry, 
    className 
}: { 
    title?: string;
    description?: string;
    onRetry?: () => void; 
    className?: string;
}) {
    return (
        <EmptyState
            icon={<EmptyStateIcons.Error />}
            title={title}
            description={description}
            action={
                onRetry
                    ? {
                          label: 'Try Again',
                          onClick: onRetry,
                          variant: 'primary',
                      }
                    : undefined
            }
            className={className}
        />
    );
}
