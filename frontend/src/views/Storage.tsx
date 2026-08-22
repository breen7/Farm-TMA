import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAppState } from '../lib/auth';
import { RESOURCE_SELL_PRICES } from '../lib/farmEconomy';
import { ArrowUpIcon, CoinIcon } from '../lib/icons';
import type { InventoryEntry, SellResult, UpgradeAnimalResult, UpgradeStorageResult } from '../types';

const RESOURCE_EMOJI: Record<string, string> = {
  wheat: '🌾',
  eggs: '🥚',
  milk: '🥛',
};

const ANIMAL_INFO: Record<string, { name: string; icon: string }> = {
  eggs: { name: 'Gallinas', icon: '🐔' },
  milk: { name: 'Vacas', icon: '🐄' },
};

export function StorageView() {
  const { user, farm, inventory: bootstrapInventory, error: bootstrapError, refetch, refetchIfStale } = useAppState();
  const inventory = bootstrapInventory ?? [];
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sellingResource, setSellingResource] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradingAnimal, setUpgradingAnimal] = useState<string | null>(null);

  useEffect(() => {
    refetchIfStale();
  }, [refetchIfStale]);

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
      await refetch();
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
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo mejorar el silo.');
    } finally {
      setUpgrading(false);
    }
  };

  const upgradeAnimal = async (resource: string) => {
    setUpgradingAnimal(resource);
    setError(null);
    try {
      const result = await api.post<UpgradeAnimalResult>('/farm/upgrade-animal', { resource });
      const name = ANIMAL_INFO[resource]?.name ?? resource;
      setNotice(`${name} mejorada a Tier ${result.tier} · nueva tasa: ${(result.productionRate[resource] ?? 0).toFixed(2)}/h`);
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo mejorar el animal.');
    } finally {
      setUpgradingAnimal(null);
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

      {(error || bootstrapError) && (
        <p className="rounded-lg bg-farm-danger/20 p-2 text-sm text-farm-danger">{error ?? bootstrapError}</p>
      )}
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

      {farm && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-farm-text-dim">Animales</h2>
          {Object.entries(ANIMAL_INFO).map(([resource, info]) => {
            const tier = farm.animalTiers[resource] ?? 1;
            const rate = farm.productionRate[resource] ?? 0;
            const nextCost = farm.nextAnimalUpgradeCosts[resource] ?? null;
            return (
              <div
                key={resource}
                className="flex items-center justify-between gap-3 rounded-2xl border border-farm-border bg-gradient-to-b from-farm-surface-hi to-farm-surface p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/40 text-xl">
                    {info.icon}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-farm-text">
                      {info.name} · Tier {tier}
                    </p>
                    <p className="text-sm font-semibold text-[#4ade80]">{rate.toFixed(2)}/h</p>
                  </div>
                </div>
                {nextCost === null ? (
                  <span className="whitespace-nowrap rounded-full bg-black/40 px-3 py-1.5 text-sm font-semibold text-farm-text-dim">
                    Nivel máximo
                  </span>
                ) : (
                  <button
                    onClick={() => upgradeAnimal(resource)}
                    disabled={upgradingAnimal === resource}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-400/80 px-3 py-1.5 text-sm font-semibold text-amber-300 disabled:opacity-50"
                  >
                    <ArrowUpIcon />
                    Mejorar ({nextCost} coins)
                  </button>
                )}
              </div>
            );
          })}
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
