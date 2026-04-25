import React, { useState } from 'react';
import { webhookApi, WebhookEventType, CreateWebhookInput } from '../../services/webhookApi';
import { useWallet } from '../../hooks/useWallet';
import { Card } from '../UI/Card';
import { Button } from '../UI/Button';
import { Input } from '../UI/Input';

interface WebhookSubscriptionFormProps {
    onSuccess?: () => void;
}

export function WebhookSubscriptionForm({ onSuccess }: WebhookSubscriptionFormProps) {
    const { wallet } = useWallet();
    const [url, setUrl] = useState('');
    const [tokenAddress, setTokenAddress] = useState('');
    const [selectedEvents, setSelectedEvents] = useState<WebhookEventType[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const eventOptions = [
        { value: WebhookEventType.TOKEN_BURN_SELF, label: 'Token Burn (Self)', description: 'Triggered when you burn your own tokens' },
        { value: WebhookEventType.TOKEN_BURN_ADMIN, label: 'Token Burn (Admin)', description: 'Triggered when an admin burns tokens' },
        { value: WebhookEventType.TOKEN_CREATED, label: 'Token Created', description: 'Triggered when a new token is created' },
        { value: WebhookEventType.TOKEN_METADATA_UPDATED, label: 'Metadata Updated', description: 'Triggered when token metadata is updated' },
    ];

    const toggleEvent = (event: WebhookEventType) => {
        setSelectedEvents(prev => 
            prev.includes(event) 
                ? prev.filter(e => e !== event) 
                : [...prev, event]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!wallet?.address) return;

        if (!url) {
            setError('Webhook URL is required');
            return;
        }

        if (selectedEvents.length === 0) {
            setError('Select at least one event');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const input: CreateWebhookInput = {
                url,
                tokenAddress: tokenAddress || undefined,
                events: selectedEvents,
                createdBy: wallet.address,
            };

            await webhookApi.subscribe(input);
            setUrl('');
            setTokenAddress('');
            setSelectedEvents([]);
            onSuccess?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create subscription');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Card className="p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Create Webhook Subscription</h3>
            
            <form onSubmit={handleSubmit} className="space-y-6">
                <Input 
                    label="Webhook URL"
                    placeholder="https://your-api.com/webhook"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    helperText="The endpoint where we will send POST requests"
                    required
                />

                <Input 
                    label="Token Address (Optional)"
                    placeholder="G..."
                    value={tokenAddress}
                    onChange={(e) => setTokenAddress(e.target.value)}
                    helperText="Only receive events for this specific token"
                />

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                        Events to subscribe
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {eventOptions.map((opt) => (
                            <div 
                                key={opt.value}
                                onClick={() => toggleEvent(opt.value)}
                                className={`p-4 border rounded-xl cursor-pointer transition-all ${
                                    selectedEvents.includes(opt.value)
                                        ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                                        : 'bg-white border-gray-200 hover:border-blue-300'
                                }`}
                            >
                                <div className="flex items-start">
                                    <div className="flex items-center h-5 mr-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedEvents.includes(opt.value)}
                                            readOnly
                                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">{opt.label}</p>
                                        <p className="text-xs text-gray-500 mt-1">{opt.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
                        {error}
                    </div>
                )}

                <div className="pt-4">
                    <Button 
                        type="submit" 
                        variant="primary" 
                        className="w-full"
                        loading={isSubmitting}
                        disabled={!wallet?.connected}
                    >
                        Create Subscription
                    </Button>
                </div>
            </form>
        </Card>
    );
}
