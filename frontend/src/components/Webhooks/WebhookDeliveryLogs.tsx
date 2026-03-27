import React, { useEffect, useState, useCallback } from 'react';
import { webhookApi, WebhookDeliveryLog } from '../../services/webhookApi';
import { Spinner } from '../UI/Spinner';
import { Icons } from '../UI/Icons';

interface WebhookDeliveryLogsProps {
    subscriptionId: string;
}

export function WebhookDeliveryLogs({ subscriptionId }: WebhookDeliveryLogsProps) {
    const [logs, setLogs] = useState<WebhookDeliveryLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const data = await webhookApi.getLogs(subscriptionId);
            setLogs(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load delivery logs');
        } finally {
            setLoading(false);
        }
    }, [subscriptionId]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Spinner size="lg" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-center text-red-600">
                <p>{error}</p>
                <button 
                    onClick={fetchLogs}
                    className="mt-2 text-sm text-blue-600 hover:underline"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="p-12 text-center text-gray-500">
                <Icons.AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p>No delivery logs found for this subscription yet.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Event
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Attempts
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Response
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center">
                                    {log.success ? (
                                        <Icons.CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                                    ) : (
                                        <Icons.XCircle className="w-5 h-5 text-red-500 mr-2" />
                                    )}
                                    <span className={`text-sm font-medium ${log.success ? 'text-green-900' : 'text-red-900'}`}>
                                        {log.statusCode || 'Failed'}
                                    </span>
                                </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm text-gray-900 font-mono">
                                    {log.event}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                                {log.attempts}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {new Date(log.createdAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                                {log.success ? 'OK' : (log.errorMessage || 'Unknown Error')}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
