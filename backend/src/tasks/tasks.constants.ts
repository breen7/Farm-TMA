export interface TaskDefinition {
  code: string;
  title: string;
  description: string;
  rewardBucks: number;
  targetCount: number;
}

/**
 * Definiciones estaticas: son pocas y cambian junto al codigo que las
 * completa (ads/auth/farm), igual que DEPTH_SHARE en referrals o
 * BOOST_MULTIPLIER en farm. Solo el progreso por usuario vive en DB
 * (UserTaskProgress, indexado por `code`).
 *
 * Nota: a diferencia de la maqueta original del frontend, estas tareas son
 * de una sola vez (no se reinician a diario) — implementar un reset diario
 * real es trabajo aparte (zona horaria, expiracion de recompensas no
 * reclamadas, etc.) que no se aborda en este pase.
 */
export const TASK_DEFINITIONS: TaskDefinition[] = [
  {
    code: 'watch_3_ads',
    title: 'Mira 3 anuncios',
    description: 'Mira 3 anuncios recompensados para ganar bucks extra.',
    rewardBucks: 15,
    targetCount: 3,
  },
  {
    code: 'invite_friend',
    title: 'Invita a un amigo',
    description: 'Comparte tu enlace de referido y consigue tu primer referido.',
    rewardBucks: 50,
    targetCount: 1,
  },
  {
    code: 'collect_5_times',
    title: 'Cosecha 5 veces',
    description: 'Recoge tu produccion 5 veces.',
    rewardBucks: 20,
    targetCount: 5,
  },
];

export function findTaskDefinition(code: string): TaskDefinition | undefined {
  return TASK_DEFINITIONS.find((task) => task.code === code);
}
