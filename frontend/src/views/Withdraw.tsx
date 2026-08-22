import { useEffect, useState, type FormEvent } from 'react';
import { TonConnectButton, useTonAddress } from '@tonconnect/ui-react';
import { api, ApiError } from '../api/client';
import { useAppState } from '../lib/auth';
import { SendIcon } from '../lib/icons';
import type { WithdrawalAsset } from '../types';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  QUEUED: 'En cola',
  RISK_REVIEW: 'En revision',
  PROCESSING: 'Procesando',
  COMPLETED: 'Completado',
  FAILED: 'Fallido',
  REJECTED: 'Rechazado',
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-black/40 text-farm-text-dim',
  QUEUED: 'bg-black/40 text-farm-text-dim',
  RISK_REVIEW: 'bg-amber-400/20 text-amber-300',
  PROCESSING: 'bg-amber-400/20 text-amber-300',
  COMPLETED: 'bg-farm-primary/20 text-farm-primary',
  FAILED: 'bg-farm-danger/20 text-farm-danger',
  REJECTED: 'bg-farm-danger/20 text-farm-danger',
};

export function WithdrawView() {
  const tonAddress = useTonAddress();
  const { withdrawals, error: bootstrapError, refetch, refetchIfStale } = useAppState();
  const history = withdrawals ?? [];
  const [amountBucks, setAmountBucks] = useState('');
  const [asset, setAsset] = useState<WithdrawalAsset>('USDT');
  const [destinationWallet, setDestinationWallet] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refetchIfStale();
  }, [refetchIfStale]);

  useEffect(() => {
    if (tonAddress && !destinationWallet) {
      setDestinationWallet(tonAddress);
    }
  }, [tonAddress, destinationWallet]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.post('/withdrawals', { amountBucks: Number(amountBucks), asset, destinationWallet });
      setSuccess('Retiro solicitado correctamente.');
      setAmountBucks('');
      await refetch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo solicitar el retiro.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-farm-text">Retirar</h1>
        <TonConnectButton />
      </header>

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-2xl border border-farm-border bg-gradient-to-b from-farm-surface-hi to-farm-surface p-4"
      >
        <label className="flex flex-col gap-1 text-sm text-farm-text-dim">
          Monto en Pulso
          <input
            type="number"
            min="1"
            step="1"
            required
            value={amountBucks}
            onChange={(event) => setAmountBucks(event.target.value)}
            className="rounded-xl border border-farm-border bg-black/40 px-3 py-2 text-farm-text"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-farm-text-dim">
          Activo
          <select
            value={asset}
            onChange={(event) => setAsset(event.target.value as WithdrawalAsset)}
            className="rounded-xl border border-farm-border bg-black/40 px-3 py-2 text-farm-text"
          >
            <option value="USDT">USDT</option>
            <option value="TON">TON</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-farm-text-dim">
          Wallet de destino
          <input
            type="text"
            required
            value={destinationWallet}
            onChange={(event) => setDestinationWallet(event.target.value)}
            placeholder="Conecta tu wallet o pega una direccion TON"
            className="rounded-xl border border-farm-border bg-black/40 px-3 py-2 text-farm-text"
          />
        </label>

        {(error || bootstrapError) && <p className="text-sm text-farm-danger">{error ?? bootstrapError}</p>}
        {success && <p className="text-sm text-farm-primary">{success}</p>}

        <button
          type="submit"
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1b6a38] to-[#2e9e54] py-3 font-semibold text-white disabled:opacity-50"
        >
          <SendIcon />
          Solicitar retiro
        </button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-farm-text-dim">Historial</h2>
        {history.length === 0 && <p className="text-sm text-farm-text-dim">Todavia no hiciste ningun retiro.</p>}
        {history.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-2xl border border-farm-border bg-gradient-to-b from-farm-surface-hi to-farm-surface p-3"
          >
            <div>
              <p className="font-medium text-farm-text">
                {item.amountUsd} USD · {item.asset}
              </p>
              <p className="text-xs text-farm-text-dim">{new Date(item.createdAt).toLocaleString()}</p>
            </div>
            <span
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                STATUS_STYLE[item.status] ?? 'bg-black/40 text-farm-text-dim'
              }`}
            >
              {STATUS_LABEL[item.status] ?? item.status}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
