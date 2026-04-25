import type { ReactNode } from 'react';

interface HeaderProps {
    children?: ReactNode;
}

export function Header({ children }: HeaderProps) {
    return (
        <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <div className="flex items-center gap-8">
                        <h1 className="text-2xl font-bold text-gray-900">
                            Stellar Token Deployer
                        </h1>
                        <nav className="hidden md:flex items-center gap-4">
                            <NavLink to="/" label="Deploy" />
                            <NavLink to="/streams" label="Streams" />
                            <NavLink to="/vaults" label="Vaults" />
                        </nav>
                    </div>
                    <div className="flex items-center gap-4">{children}</div>
                </div>
            </div>
        </header>
    );
}

function NavLink({ to, label }: { to: string; label: string }) {
    const isActive = typeof window !== 'undefined' && window.location.pathname === to;
    
    return (
        <a
            href={to}
            className={`px-3 py-2 text-sm font-medium rounded-md transition ${
                isActive 
                ? 'bg-blue-50 text-blue-700' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
        >
            {label}
        </a>
    );
}
