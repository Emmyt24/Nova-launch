import React, { useState } from 'react';
import { WebhookSubscriptionList } from './WebhookSubscriptionList';
import { WebhookSubscriptionForm } from './WebhookSubscriptionForm';
import { Button } from '../UI/Button';

export function WebhookManager() {
    const [showForm, setShowForm] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const handleSuccess = () => {
        setShowForm(false);
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-white">Webhook Management</h1>
                    <p className="mt-2 text-text-secondary">
                        Configure real-time event notifications for your token operations.
                    </p>
                </div>
                <Button 
                    variant="primary" 
                    onClick={() => setShowForm(!showForm)}
                    className="w-full sm:w-auto"
                >
                    {showForm ? 'Cancel' : 'Create New Webhook'}
                </Button>
            </div>

            <div className="space-y-8">
                {showForm && (
                    <div className="animate-slideDown">
                        <WebhookSubscriptionForm onSuccess={handleSuccess} />
                    </div>
                )}
                
                <WebhookSubscriptionList key={refreshTrigger} />
            </div>
        </div>
    );
}
