import { comment } from '@ton/core';
import type { SendTransactionRequest } from '@tonconnect/ui-react';
import type { DepositIntent } from '../types';

const NANO_PER_TON = 1_000_000_000;
const VALID_FOR_SECONDS = 5 * 60;

/**
 * Arma la transaccion que le pedimos a la wallet (via TonConnect) que firme
 * y mande: el monto exacto de la intencion, a la tesoreria, con la
 * `depositReference` como comentario — es lo unico que le permite al
 * backend identificar a que deposito corresponde la transferencia una vez
 * que aparece en la cadena (ver TonService.findIncomingDeposit).
 */
export function buildDepositTransaction(intent: DepositIntent): SendTransactionRequest {
  const amountNano = BigInt(Math.round(Number(intent.amount) * NANO_PER_TON));
  const payload = comment(intent.depositReference).toBoc().toString('base64');

  return {
    validUntil: Math.floor(Date.now() / 1000) + VALID_FOR_SECONDS,
    messages: [
      {
        address: intent.treasuryWallet,
        amount: amountNano.toString(),
        payload,
      },
    ],
  };
}
