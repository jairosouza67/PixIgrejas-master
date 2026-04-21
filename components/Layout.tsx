import React from 'react';
import { LucideLayoutDashboard, LucideUpload, LucideList, LucideLogOut, LucideSheet } from 'lucide-react';
import { User, UserRole } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export const Logo: React.FC<{ className?: string }> = ({ className }) => (
  <img 
    src="/logo.png" 
    alt="Congregação Cristã no Brasil" 
    className={`${className} object-contain bg-white rounded-lg`} 
  />
);

export const Layout: React.FC<LayoutProps> = ({ children, user, currentPath, onNavigate, onLogout }) => {
  if (!user) return <>{children}</>;

  const adminMenu = [
    { id: 'dashboard', label: 'Dashboard', icon: LucideLayoutDashboard, path: '/admin/dashboard' },
    { id: 'upload', label: 'Upload Extrato', icon: LucideUpload, path: '/admin/upload' },
    { id: 'transactions', label: 'Transações', icon: LucideList, path: '/admin/transactions' },
  ];

  const churchMenu = [
    { id: 'my-transactions', label: 'Minhas Doações', icon: LucideList, path: '/me/transactions' },
    { id: 'my-sheet', label: 'Minha Planilha', icon: LucideSheet, path: '/me/sheet' },
  ];

  const menu = user.role === UserRole.ADMIN ? adminMenu : churchMenu;

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-white flex flex-col shadow-xl">
        <div className="p-6 border-b border-slate-800 flex flex-col items-center text-center">
           {/* Logo Imagem Externa */}
           <Logo className="h-24 w-auto mb-4" />
          
          <div>
            <h1 className="text-xs font-bold text-white uppercase tracking-wider leading-tight mb-1">
              Congregação Cristã<br/>no Brasil
            </h1>
            <div className="w-full h-px bg-slate-700 my-2"></div>
            <p className="text-[11px] text-blue-300 uppercase font-bold tracking-wide">
              Administração<br/>Vitória da Conquista
            </p>
          </div>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1">
          {menu.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                currentPath === item.path
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="mb-4 px-2">
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LucideLogOut size={16} />
            Sair do Sistema
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-slate-800">
            {menu.find(m => m.path === currentPath)?.label || 'Bem-vindo'}
          </h2>
          <div className="text-right hidden sm:block">
             <p className="text-xs text-slate-400 font-medium">CCB - Vitória da Conquista</p>
          </div>
        </header>
        <div className="p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};