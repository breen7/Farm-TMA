export const DEPOSITS_SWEEP_QUEUE = 'deposits-sweep';

/** Redes soportadas hoy. BSC/TRON quedan planificadas (ver DepositRequest.network en schema.prisma). */
export const SUPPORTED_DEPOSIT_NETWORKS = ['TON'] as const;
export type SupportedDepositNetwork = (typeof SUPPORTED_DEPOSIT_NETWORKS)[number];

export const SUPPORTED_DEPOSIT_PURPOSES = ['FARM_BOOST'] as const;
export type SupportedDepositPurpose = (typeof SUPPORTED_DEPOSIT_PURPOSES)[number];
