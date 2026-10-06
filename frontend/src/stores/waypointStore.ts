import { create } from 'zustand';
import { db } from '../utils/db';
import { newId } from '../utils/id';
import { publishMissionChange, type PublishResult } from '../utils/release';
import { useMissionStore } from './missionStore';
import { useAssetStore } from './assetStore';
import type { Waypoint, WaypointDraft } from '../types/waypoint';

/** 读取任务当前已发布版本（保存前核对用） */
function currentVersion(missionId: string): number {
  return useMissionStore.getState().items.find((m) => m.id === missionId)?.version ?? 0;
}

/** 发布成功后同步本地状态：任务版本号 + 已编目成果转待复核（库内写入已在发布事务中完成） */
function afterPublished(missionId: string, version: number): void {
  useMissionStore.getState().applyVersion(missionId, version);
  useAssetStore.getState().markMissionPendingReview(missionId);
}

const NOT_FOUND: PublishResult = { ok: false, reason: 'error', message: '航点不存在或已被删除' };

interface WaypointState {
  items: Waypoint[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (draft: WaypointDraft) => Promise<PublishResult>;
  addMany: (drafts: WaypointDraft[]) => Promise<PublishResult>;
  update: (id: string, patch: Partial<Waypoint>) => Promise<PublishResult>;
  /** 批量修改本任务全部航点高度（单次发布） */
  setAltitudeForMission: (missionId: string, altitude: number) => Promise<PublishResult>;
  move: (id: string, direction: 'up' | 'down') => Promise<PublishResult | null>;
  reorder: (fromId: string, toId: string) => Promise<PublishResult>;
  removeByMission: (missionId: string) => Promise<PublishResult>;
  remove: (id: string) => Promise<PublishResult>;
  byMission: (missionId: string) => Waypoint[];
}

export const useWaypointStore = create<WaypointState>((set, get) => ({
  items: [],
  loaded: false,
  async load() {
    const rows = await db.waypoints.toArray();
    rows.sort((a, b) => a.seq - b.seq);
    set({ items: rows, loaded: true });
  },
  async add(draft) {
    const record: Waypoint = { ...draft, id: newId('wp') };
    const result = await publishMissionChange({
      missionId: draft.missionId,
      baseVersion: currentVersion(draft.missionId),
      source: '航点',
      apply: async () => {
        await db.waypoints.put(record);
      },
    });
    if (result.ok) {
      set({ items: [...get().items, record] });
      afterPublished(draft.missionId, result.version);
    }
    return result;
  },
  async addMany(drafts) {
    if (drafts.length === 0) return { ok: false, reason: 'error', message: '没有可导入的航点' };
    const missionId = drafts[0].missionId;
    const records: Waypoint[] = drafts.map((d) => ({ ...d, id: newId('wp') }));
    const result = await publishMissionChange({
      missionId,
      baseVersion: currentVersion(missionId),
      source: '航点',
      apply: async () => {
        await db.waypoints.bulkPut(records);
      },
    });
    if (result.ok) {
      set({ items: [...get().items, ...records] });
      afterPublished(missionId, result.version);
    }
    return result;
  },
  async update(id, patch) {
    const target = get().items.find((it) => it.id === id);
    if (!target) return NOT_FOUND;
    const result = await publishMissionChange({
      missionId: target.missionId,
      baseVersion: currentVersion(target.missionId),
      source: '航点',
      apply: async () => {
        await db.waypoints.update(id, patch);
      },
    });
    if (result.ok) {
      set({ items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
      afterPublished(target.missionId, result.version);
    }
    return result;
  },
  async setAltitudeForMission(missionId, altitude) {
    const count = get().items.filter((it) => it.missionId === missionId).length;
    if (count === 0) return { ok: false, reason: 'error', message: '暂无航点可修改' };
    const result = await publishMissionChange({
      missionId,
      baseVersion: currentVersion(missionId),
      source: '航点',
      apply: async () => {
        await db.waypoints.where('missionId').equals(missionId).modify({ altitude });
      },
    });
    if (result.ok) {
      set({ items: get().items.map((it) => (it.missionId === missionId ? { ...it, altitude } : it)) });
      afterPublished(missionId, result.version);
    }
    return result;
  },
  /** 与相邻航点交换序号；没有相邻航点时返回 null（无操作） */
  async move(id, direction) {
    const list = get().byMission(get().items.find((it) => it.id === id)?.missionId ?? '');
    const index = list.findIndex((it) => it.id === id);
    const target = direction === 'up' ? list[index - 1] : list[index + 1];
    if (!target) return null;
    return get().reorder(id, target.id);
  },
  async reorder(fromId, toId) {
    const from = get().items.find((it) => it.id === fromId);
    const to = get().items.find((it) => it.id === toId);
    if (!from || !to) return NOT_FOUND;
    const fromSeq = from.seq;
    const result = await publishMissionChange({
      missionId: from.missionId,
      baseVersion: currentVersion(from.missionId),
      source: '航点',
      apply: async () => {
        await db.waypoints.update(from.id, { seq: to.seq });
        await db.waypoints.update(to.id, { seq: fromSeq });
      },
    });
    if (result.ok) {
      set({
        items: get().items.map((it) => {
          if (it.id === from.id) return { ...it, seq: to.seq };
          if (it.id === to.id) return { ...it, seq: fromSeq };
          return it;
        }),
      });
      afterPublished(from.missionId, result.version);
    }
    return result;
  },
  async removeByMission(missionId) {
    const ids = get().items.filter((it) => it.missionId === missionId).map((it) => it.id);
    if (ids.length === 0) return { ok: false, reason: 'error', message: '暂无航点可清空' };
    const result = await publishMissionChange({
      missionId,
      baseVersion: currentVersion(missionId),
      source: '航点',
      apply: async () => {
        await db.waypoints.bulkDelete(ids);
      },
    });
    if (result.ok) {
      set({ items: get().items.filter((it) => it.missionId !== missionId) });
      afterPublished(missionId, result.version);
    }
    return result;
  },
  async remove(id) {
    const target = get().items.find((it) => it.id === id);
    if (!target) return NOT_FOUND;
    const result = await publishMissionChange({
      missionId: target.missionId,
      baseVersion: currentVersion(target.missionId),
      source: '航点',
      apply: async () => {
        await db.waypoints.delete(id);
      },
    });
    if (result.ok) {
      set({ items: get().items.filter((it) => it.id !== id) });
      afterPublished(target.missionId, result.version);
    }
    return result;
  },
  byMission(missionId) {
    return get()
      .items.filter((it) => it.missionId === missionId)
      .sort((a, b) => a.seq - b.seq);
  },
}));
