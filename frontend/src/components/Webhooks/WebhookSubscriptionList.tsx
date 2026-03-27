import React, { useEffect, useState, useCallback } from 'react';
import { webhookApi, WebhookSubscription, WebhookEventType } from '../../services/webhookApi';
import { useWallet } from '../../hooks/useWallet';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Spinner } from '../UI/Spinner';
import { ConfirmDialog } from '../UI/ConfirmDialog';
import { Modal } from '../UI/Modal';
import { WebhookDeliveryLogs } from './WebhookDeliveryLogs';
import { Icons } from '../UI/Icons';

export function WebhookSubscriptionList() {
    const { wallet } = useWallet();
    const [subscriptions, setSubscriptions] = useState<WebhookSubscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
    const [isTestingId, setIsTestingId] = useState<string | null>(null);

    const fetchSubscriptions = useCallback(async () => {
        if (!wallet?.address) return;
        setLoading(true);
        try {
            const data = await webhookApi.listSubscriptions(wallet.address);
            setSubscriptions(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
        } finally {
            setLoading(false);
        }
    }, [wallet?.address]);

    useEffect(() => {
        fetchSubscriptions();
    }, [fetchSubscriptions]);

    const handleToggle = async (id: string, currentActive: boolean) => {
        try {
            await webhookApi.toggleStatus(id, !currentActive);
            setSubscriptions(prev => 
                prev.map(sub => sub.id === id ? { ...sub, active: !currentActive } : sub)
            );
        } catch (err) {
            console.error('Failed to toggle status:', err);
        }
    };

    const handleDelete = async () => {
        if (!deletingId || !wallet?.address) return;
        setIsDeleting(true);
        try {
            await webhookApi.unsubscribe(deletingId, wallet.address);
            setSubscriptions(prev => prev.filter(sub => sub.id !== deletingId));
            setDeletingId(null);
        } catch (err) {
            console.error('Failed to delete subscription:', err);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleTest = async (id: string) => {
        setIsTestingId(id);
        try {
            const res = await webhookApi.testWebhook(id);
            // Show success/fail toast would be nice here
            alert(res.message);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Test failed');
        } finally {
            setIsTestingId(null);
        }
    };

    if (!wallet?.connected) {
        return (
            <Card className="p-8 text-center">
                <p className="text-gray-500">Please connect your wallet to manage webhooks.</p>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">Webhook Subscriptions</h2>
                <Button variant="primary" onClick={fetchSubscriptions}>
                    Refresh
                </Button>
            </div>

            {loading && (
                <div className="flex justify-center py-12">
                    <Spinner size="lg" />
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
                    {error}
                </div>
            )}

            {!loading && subscriptions.length === 0 && (
                <Card className="p-12 text-center border-dashed border-2">
                    <div className="flex flex-col items-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                           <Icons.Bell className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No webhooks yet</h3>
                        <p className="text-gray-500 max-w-sm mx-auto">
                            Create a webhook subscription to receive real-time updates about token burns and creations.
                        </p>
                    </div>
                </Card>
            )}

            <div className="grid gap-6">
                {subscriptions.map((sub) => (
                    <Card key={sub.id} className="overflow-hidden border-l-4 border-l-blue-500">
                        <div className="p-6">
                            <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-lg font-bold text-gray-900 truncate">
                                            {sub.url}
                                        </h3>
                                        <StatusBadge active={sub.active} />
                                    </div>
                                    <p className="text-sm text-gray-500 font-mono bg-gray-50 p-1 rounded inline-block">
                                        ID: {sub.id}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => handleToggle(sub.id, sub.active)}
                                    >
                                        {sub.active ? 'Disable' : 'Enable'}
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        loading={isTestingId === sub.id}
                                        onClick={() => handleTest(sub.id)}
                                    >
                                        Test
                                    </Button>
                                    <Button 
                                        variant="danger" 
                                        size="sm"
                                        onClick={() => setDeletingId(sub.id)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                        Subscribed Events
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {sub.events.map(event => (
                                            <EventTypeBadge key={event} event={event} />
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
                                        Secret (Masked)
                                    </h4>
                                    <div className="flex items-center gap-2 text-sm text-gray-600 font-mono bg-gray-50 px-3 py-2 rounded border">
                                        <Icons.Lock className="w-4 h-4 text-gray-400" />
                                        <span>{sub.secret}</span>
                                    </div>
                                </div>
                            </div>

                            {sub.tokenAddress && (
                                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <span className="text-xs font-bold text-blue-700 uppercase block mb-1">
                                        Token Filtered
                                    </span>
                                    <span className="text-sm text-blue-900 font-mono truncate block">
                                        {sub.tokenAddress}
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-100">
                                <div className="flex gap-4 text-xs text-gray-500">
                                    <span>Created: {new Date(sub.createdAt).toLocaleDateString()}</span>
                                    {sub.lastTriggered && (
                                        <span>Last Triggered: {new Date(sub.lastTriggered).toLocaleString()}</span>
                                    )}
                                </div>
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                    onClick={() => setSelectedSubId(sub.id)}
                                >
                                    View Delivery Logs
                                </Button>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <ConfirmDialog 
                isOpen={!!deletingId}
                onClose={() => setDeletingId(null)}
                onConfirm={handleDelete}
                title="Delete Webhook Subscription"
                message="Are you sure you want to delete this webhook subscription? You will stop receiving events at this URL."
                action="custom"
                confirmButtonVariant="danger"
                confirmText="Delete"
                isProcessing={isDeleting}
            />

            <Modal
                isOpen={!!selectedSubId}
                onClose={() => setSelectedSubId(null)}
                title="Webhook Delivery Logs"
                maxWidth="4xl"
            >
                {selectedSubId && <WebhookDeliveryLogs subscriptionId={selectedSubId} />}
            </Modal>
        </div>
    );
}

function StatusBadge({ active }: { active: boolean }) {
    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
            active 
                ? 'bg-green-100 text-green-700 border border-green-200' 
                : 'bg-gray-100 text-gray-600 border border-gray-200'
        }`}>
            {active ? 'Active' : 'Inactive'}
        </span>
    );
}

function EventTypeBadge({ event }: { event: WebhookEventType }) {
    const colors: Record<string, string> = {
        [WebhookEventType.TOKEN_BURN_SELF]: 'bg-purple-50 text-purple-700 border-purple-100',
        [WebhookEventType.TOKEN_BURN_ADMIN]: 'bg-red-50 text-red-700 border-red-100',
        [WebhookEventType.TOKEN_CREATED]: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        [WebhookEventType.TOKEN_METADATA_UPDATED]: 'bg-amber-50 text-amber-700 border-amber-100',
    };

    const labels: Record<string, string> = {
        [WebhookEventType.TOKEN_BURN_SELF]: 'Token Burn (Self)',
        [WebhookEventType.TOKEN_BURN_ADMIN]: 'Token Burn (Admin)',
        [WebhookEventType.TOKEN_CREATED]: 'Token Created',
        [WebhookEventType.TOKEN_METADATA_UPDATED]: 'Metadata Updated',
    };

    return (
        <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${colors[event]}`}>
            {labels[event] || event}
        </span>
    );
}
