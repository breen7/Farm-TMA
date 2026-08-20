export type WithdrawalStatus = 'PENDING' | 'QUEUED' | 'RISK_REVIEW' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REJECTED';
export type WithdrawalAsset = 'TON' | 'USDT';

export interface FarmState {
  level: number;
  storageCapacity: string;
  productionRate: Record<string, number>;
  animalTiers: Record<string, number>;
  nextAnimalUpgradeCosts: Record<string, number | null>;
  boostExpiresAt: string | null;
  lastCollectedAt: string;
  pendingProduction: Record<string, number>;
  pendingIsCapped: boolean;
}

export interface InventoryEntry {
  id: string;
  resource: string;
  quantity: string;
  updatedAt: string;
}

export interface CollectResult {
  collected: Record<string, number>;
  inventory: InventoryEntry[];
}

export interface BoostResult {
  boostExpiresAt: string;
  bucksBalance: string;
}

export interface SellResult {
  resource: string;
  quantitySold: number;
  coinsEarned: number;
  coinsBalance: string;
  inventory: InventoryEntry;
}

export interface UpgradeStorageResult {
  storageCapacity: string;
  coinsBalance: string;
  nextUpgradeCost: number;
}

export interface UpgradeAnimalResult {
  resource: string;
  tier: number;
  productionRate: Record<string, number>;
  coinsBalance: string;
  nextUpgradeCost: number | null;
}

export type DepositStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'FAILED';
export type DepositPurpose = 'FARM_BOOST';

export interface DepositIntent {
  id: string;
  network: string;
  asset: string;
  amount: string;
  amountUsd: string;
  purpose: DepositPurpose;
  depositReference: string;
  treasuryWallet: string;
  status: DepositStatus;
  txHash: string | null;
  expiresAt: string;
  confirmedAt: string | null;
  createdAt: string;
}

export interface WithdrawalRequestEntry {
  id: string;
  amountBucks: string;
  amountUsd: string;
  asset: WithdrawalAsset;
  destinationWallet: string;
  status: WithdrawalStatus;
  txHash: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface TaskEntry {
  code: string;
  title: string;
  description: string;
  rewardBucks: number;
  targetCount: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface ClaimTaskResult {
  taskCode: string;
  rewardBucks: number;
  bucksBalance: string;
}

export interface ReferralEntry {
  id: string;
  username: string | null;
  createdAt: string;
}

export type ReferralTree = Record<string, ReferralEntry[]>;

export type AdNetwork = 'adsgram' | 'monetag';

export interface AdRewardResult {
  bucksBalance: string;
}

export interface AuthResponse {
  id: string;
  telegramId: string;
  coinsBalance: string;
  bucksBalance: string;
}
