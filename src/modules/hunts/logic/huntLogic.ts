import type { Mission, MissionProgress } from '@/shared/types';

export interface HuntSummary {
  completedMissions: number;
  totalMissions: number;
  earnedXP: number;
  totalXP: number;
}

export function summarizeHunt(missions: Mission[], progress: MissionProgress[]): HuntSummary {
  const completedIds = new Set(progress.filter((item) => item.completed).map((item) => item.mission_id));
  return {
    completedMissions: completedIds.size,
    totalMissions: missions.length,
    earnedXP: missions.filter((mission) => completedIds.has(mission.id)).reduce((sum, mission) => sum + mission.points_reward, 0),
    totalXP: missions.reduce((sum, mission) => sum + mission.points_reward, 0),
  };
}
