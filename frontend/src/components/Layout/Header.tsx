import React from 'react';

interface HeaderProps {
    children?: React.ReactNode;
}

export function Header({ children }: HeaderProps) {
    return (
        <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <div className="flex items-center">
                        <h1 className="text-2xl font-bold text-gray-900">
                            Stellar Token Deployer
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">{children}</div>
                </div>
            </div>
        </header>
    );
}
