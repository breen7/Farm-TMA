import { useState } from 'react';
import { FarmView } from './views/Farm';
import { StorageView } from './views/Storage';
import { TasksView } from './views/Tasks';
import { WithdrawView } from './views/Withdraw';
import { useAppState } from './lib/auth';

type Tab = 'farm' | 'storage' | 'tasks' | 'withdraw';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'farm', label: 'Granja', icon: '🌾' },
  { id: 'storage', label: 'Almacen', icon: '📦' },
  { id: 'tasks', label: 'Tareas', icon: '📋' },
  { id: 'withdraw', label: 'Retirar', icon: '💸' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('farm');
  const { loading, error } = useAppState();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-farm-bg text-farm-text-dim">
        Cargando...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-farm-bg text-farm-text">
      {error && (
        <p className="bg-farm-danger/20 p-2 text-center text-sm text-farm-danger">No se pudo iniciar sesión: {error}</p>
      )}

      <main className="flex-1 overflow-y-auto pb-20">
        {tab === 'farm' && <FarmView />}
        {tab === 'storage' && <StorageView />}
        {tab === 'tasks' && <TasksView />}
        {tab === 'withdraw' && <WithdrawView />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 flex gap-1 border-t border-black/40 bg-[#0d2116] p-1.5">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium transition-colors ${
              tab === item.id
                ? 'bg-gradient-to-b from-farm-primary/40 to-farm-primary/10 text-farm-primary shadow-[0_0_12px_-2px_rgba(95,216,115,0.5)]'
                : 'text-farm-text-dim'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
