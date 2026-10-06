import { useMemo, useState } from 'react';
import { useMissionStore } from '../stores/missionStore';
import { useWaypointStore } from '../stores/waypointStore';
import { useAssetStore } from '../stores/assetStore';
import type { Mission, MissionStatus } from '../types/mission';

export interface MissionFilters {
  keyword: string;
  areaName: string;
  droneModel: string;
  dateFrom: string;
  dateTo: string;
  status: MissionStatus | 'all';
  sortBy: 'createdAt' | 'flightDate' | 'missionNo';
}

export const DEFAULT_MISSION_FILTERS: MissionFilters = {
  keyword: '',
  areaName: 'all',
  droneModel: 'all',
  dateFrom: '',
  dateTo: '',
  status: 'all',
  sortBy: 'createdAt',
};

export interface MissionRow {
  mission: Mission;
  waypointCount: number;
  assetCount: number;
}

/**
 * 按测区、机型、飞行日期区间、状态过滤任务。
 * 被任务台账（/missions）与成果编目页（/missions/:id/assets）消费。
 */
export function useMissionFilter(initial?: Partial<MissionFilters>) {
  const missions = useMissionStore((s) => s.items);
  const loaded = useMissionStore((s) => s.loaded);
  const waypoints = useWaypointStore((s) => s.items);
  const assets = useAssetStore((s) => s.items);

  const [filters, setFilters] = useState<MissionFilters>({ ...DEFAULT_MISSION_FILTERS, ...initial });

  const options = useMemo(
    () => ({
      areaNames: Array.from(new Set(missions.map((m) => m.areaName))).filter(Boolean),
      droneModels: Array.from(new Set(missions.map((m) => m.droneModel))).filter(Boolean),
    }),
    [missions],
  );

  const result = useMemo<MissionRow[]>(() => {
    const kw = filters.keyword.trim().toLowerCase();
    const rows = missions
      .filter((mission) => {
        if (filters.areaName !== 'all' && mission.areaName !== filters.areaName) return false;
        if (filters.droneModel !== 'all' && mission.droneModel !== filters.droneModel) return false;
        if (filters.status !== 'all' && mission.status !== filters.status) return false;
        if (filters.dateFrom && mission.flightDate < filters.dateFrom) return false;
        if (filters.dateTo && mission.flightDate > filters.dateTo) return false;
        if (kw) {
          const hit =
            mission.missionNo.toLowerCase().includes(kw) ||
            mission.name.toLowerCase().includes(kw) ||
            mission.pilot.toLowerCase().includes(kw) ||
            mission.cameraModel.toLowerCase().includes(kw);
          if (!hit) return false;
        }
        return true;
      })
      .map((mission) => ({
        mission,
        waypointCount: waypoints.filter((w) => w.missionId === mission.id).length,
        assetCount: assets.filter((a) => a.missionId === mission.id).length,
      }));
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (filters.sortBy === 'missionNo') return a.mission.missionNo.localeCompare(b.mission.missionNo);
      if (filters.sortBy === 'flightDate') return a.mission.flightDate.localeCompare(b.mission.flightDate);
      return b.mission.createdAt - a.mission.createdAt;
    });
    return sorted;
  }, [missions, waypoints, assets, filters]);

  const patch = (p: Partial<MissionFilters>) => setFilters((prev) => ({ ...prev, ...p }));

  return {
    filters,
    setFilters,
    patch,
    reset: () => setFilters(DEFAULT_MISSION_FILTERS),
    result,
    options,
    loaded,
  };
}
