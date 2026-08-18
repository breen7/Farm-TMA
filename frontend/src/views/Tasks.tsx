import { useCallback, useEffect, useState } from 'react';
import { shareURL } from '@telegram-apps/sdk-react';
import { api, ApiError } from '../api/client';
import { useCurrentUser } from '../lib/auth';
import { buildReferralLink } from '../lib/referral';
import { CheckIcon, CopyIcon, GiftIcon, ShareIcon } from '../lib/icons';
import type { ClaimTaskResult, ReferralTree, TaskEntry } from '../types';

function ReferralCard() {
  const { user } = useCurrentUser();
  const [tree, setTree] = useState<ReferralTree | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<ReferralTree>('/referrals/tree')
      .then(setTree)
      .catch(() => {
        // La tarjeta sigue siendo util (compartir el link) aunque no carguen los conteos.
      });
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  const link = user ? buildReferralLink(user.telegramId) : null;
  const directCount = tree?.['1']?.length ?? 0;

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  const share = () => {
    if (!link) return;
    if (shareURL.isAvailable()) {
      shareURL(link, '¡Unite a mi granja en Telegram y ganemos Pulso juntos!');
    } else {
      copyLink();
    }
  };

  return (
    <div className="rounded-2xl border border-farm-border bg-gradient-to-b from-farm-surface-hi to-farm-surface p-4">
      <p className="font-semibold text-farm-text">Invitá amigos</p>
      {!link ? (
        <p className="mt-1 text-sm text-farm-text-dim">
          Falta configurar <code>VITE_BOT_USERNAME</code> y <code>VITE_MINI_APP_SHORT_NAME</code> para generar tu link.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-farm-text-dim">
            {directCount > 0
              ? `Tenés ${directCount} referido${directCount === 1 ? '' : 's'} directo${directCount === 1 ? '' : 's'}.`
              : 'Compartí tu link y ganá comisión por cada amigo que juegue.'}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={share}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#1b6a38] to-[#2e9e54] px-3 py-2 text-sm font-semibold text-white"
            >
              <ShareIcon />
              Compartir
            </button>
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-farm-border px-3 py-2 text-sm text-farm-text-dim"
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? 'Copiado' : 'Copiar link'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function TasksView() {
  const [tasks, setTasks] = useState<TaskEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimingCode, setClaimingCode] = useState<string | null>(null);
  const [lastClaim, setLastClaim] = useState<ClaimTaskResult | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await api.get<TaskEntry[]>('/tasks'));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!lastClaim) return;
    const timeout = setTimeout(() => setLastClaim(null), 3000);
    return () => clearTimeout(timeout);
  }, [lastClaim]);

  const claim = async (code: string) => {
    setClaimingCode(code);
    setError(null);
    try {
      const result = await api.post<ClaimTaskResult>(`/tasks/${code}/claim`);
      setLastClaim(result);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo reclamar la recompensa.');
    } finally {
      setClaimingCode(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <header>
        <h1 className="text-lg font-semibold text-farm-text">Tareas</h1>
      </header>

      <ReferralCard />

      {error && <p className="rounded-lg bg-farm-danger/20 p-2 text-sm text-farm-danger">{error}</p>}
      {lastClaim && (
        <p className="flex items-center gap-1.5 rounded-xl bg-farm-primary/20 p-2 text-sm text-farm-primary">
          <GiftIcon />
          +{lastClaim.rewardBucks} Pulso · Balance: {lastClaim.bucksBalance}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {tasks?.map((task) => {
          const progressRatio = task.targetCount > 0 ? Math.min(task.progress / task.targetCount, 1) : 0;
          return (
            <li
              key={task.code}
              className={`flex items-center justify-between gap-3 rounded-2xl border border-farm-border p-3 ${
                task.claimed ? 'bg-farm-surface/50 opacity-60' : 'bg-gradient-to-b from-farm-surface-hi to-farm-surface'
              }`}
            >
              <div className="flex-1">
                <p className="font-medium text-farm-text">{task.title}</p>
                <p className="text-sm text-farm-text-dim">{task.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-farm-primary-dim to-farm-primary"
                      style={{ width: `${progressRatio * 100}%` }}
                    />
                  </div>
                  <span className="whitespace-nowrap text-xs text-farm-text-dim">
                    {Math.min(task.progress, task.targetCount)}/{task.targetCount}
                  </span>
                </div>
              </div>

              {task.claimed ? (
                <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-farm-primary/20 px-3 py-1 text-sm font-semibold text-farm-primary">
                  <CheckIcon />
                  Reclamado
                </span>
              ) : task.completed ? (
                <button
                  onClick={() => claim(task.code)}
                  disabled={claimingCode === task.code}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-amber-400 to-amber-300 px-3 py-1.5 text-sm font-bold text-[#3a2b0a] disabled:opacity-50"
                >
                  <GiftIcon />
                  Reclamar +{task.rewardBucks}
                </button>
              ) : (
                <span className="whitespace-nowrap rounded-full bg-black/40 px-3 py-1 text-sm font-semibold text-farm-text-dim">
                  +{task.rewardBucks} Pulso
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {tasks?.length === 0 && <p className="text-sm text-farm-text-dim">No hay tareas disponibles.</p>}
    </div>
  );
}
