import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useCurrentUser } from '../lib/auth';
import { RESOURCE_SELL_PRICES } from '../lib/farmEconomy';
import { ArrowUpIcon, CoinIcon } from '../lib/icons';
import type { FarmState, InventoryEntry, SellResult, UpgradeStorageResult } from '../types';

const RESOURCE_EMOJI: Record<string, string> = {
  wheat: '🌾',
  eggs: '🥚',
  milk: '🥛',
};

export function StorageView() {
  const { user, refresh: refreshUser } = useCurrentUser();
  const [farm, setFarm] = useState<FarmState | null>(null);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sellingResource, setSellingResource] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [farmState, inventoryList] = await Promise.all([
        api.get<FarmState>('/farm'),
        api.get<InventoryEntry[]>('/farm/inventory'),
      ]);
      setFarm(farmState);
      setInventory(inventoryList);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timeout);
  }, [notice]);

  const sellAll = async (entry: InventoryEntry) => {
    const quantity = Number(entry.quantity);
    if (quantity <= 0) return;

    setSellingResource(entry.resource);
    setError(null);
    try {
      const result = await api.post<SellResult>('/farm/sell', { resource: entry.resource, quantity });
      setNotice(`Vendiste ${result.quantitySold.toFixed(2)} de ${result.resource} por ${result.coinsEarned.toFixed(2)} coins`);
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo vender el recurso.');
    } finally {
      setSellingResource(null);
    }
  };

  const upgradeStorage = async () => {
    setUpgrading(true);
    setError(null);
    try {
      const result = await api.post<UpgradeStorageResult>('/farm/upgrade-storage');
      setNotice(`Silo mejorado a ${Number(result.storageCapacity).toFixed(0)} · próxima mejora: ${result.nextUpgradeCost} coins`);
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo mejorar el silo.');
    } finally {
      setUpgrading(false);
    }
  };

  const pendingTotal = farm ? Object.values(farm.pendingProduction).reduce((sum, value) => sum + value, 0) : 0;
  const capacity = farm ? Number(farm.storageCapacity) : 0;
  const fillRatio = capacity > 0 ? Math.min(pendingTotal / capacity, 1) : 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-farm-text">Almacén</h1>
        {user && (
          <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-sm font-semibold text-[#4ade80]">
            <CoinIcon />
            {Number(user.coinsBalance).toFixed(2)}
          </span>
        )}
      </header>

      {error && <p className="rounded-lg bg-farm-danger/20 p-2 text-sm text-farm-danger">{error}</p>}
      {notice && <p className="rounded-lg bg-farm-primary/20 p-2 text-sm text-farm-primary">{notice}</p>}

      {farm && (
        <div className="rounded-2xl border border-farm-border bg-gradient-to-b from-farm-surface-hi to-farm-surface p-4">
          <div className="flex justify-between text-sm text-farm-text-dim">
            <span>Silo (producción sin cosechar)</span>
            <span className="font-semibold text-farm-text">
              {pendingTotal.toFixed(1)} / {capacity.toFixed(0)}
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-farm-primary-dim to-farm-primary transition-all"
              style={{ width: `${fillRatio * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-farm-text-dim">
            El silo limita cuanto se acumula sin cosechar; una vez cosechado pasa al inventario, que no tiene tope.
          </p>
          <button
            onClick={upgradeStorage}
            disabled={upgrading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/80 py-2 text-sm font-semibold text-amber-300 disabled:opacity-50"
          >
            <ArrowUpIcon />
            Mejorar silo (+500)
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-farm-text-dim">Inventario</h2>
        {inventory.length === 0 && <p className="text-sm text-farm-text-dim">Todavia no cosechaste nada.</p>}
        {inventory.map((entry) => {
          const quantity = Number(entry.quantity);
          const price = RESOURCE_SELL_PRICES[entry.resource];
          return (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-farm-border bg-gradient-to-b from-farm-surface-hi to-farm-surface p-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/40 text-xl">
                  {RESOURCE_EMOJI[entry.resource] ?? '📦'}
                </span>
                <div>
                  <p className="text-sm font-medium capitalize text-farm-text">{entry.resource}</p>
                  <p className="text-sm font-semibold text-[#4ade80]">{quantity.toFixed(2)}</p>
                </div>
              </div>
              <button
                onClick={() => sellAll(entry)}
                disabled={quantity <= 0 || sellingResource === entry.resource}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-farm-accent px-3 py-1.5 text-sm font-semibold text-farm-bg disabled:opacity-50"
              >
                <CoinIcon />
                Vender{price ? ` (~${(quantity * price).toFixed(0)})` : ''}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
