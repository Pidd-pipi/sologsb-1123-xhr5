import { create } from 'zustand';
import { db } from '../utils/db';
import { newId } from '../utils/id';
import { useMissionStore } from './missionStore';
import type { Waypoint, WaypointDraft } from '../types/waypoint';

interface WaypointState {
  items: Waypoint[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (draft: WaypointDraft) => Promise<Waypoint>;
  addMany: (drafts: WaypointDraft[]) => Promise<Waypoint[]>;
  update: (id: string, patch: Partial<Waypoint>) => Promise<void>;
  move: (id: string, direction: 'up' | 'down') => Promise<void>;
  reorder: (fromId: string, toId: string) => Promise<void>;
  removeByMission: (missionId: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  byMission: (missionId: string) => Waypoint[];
}

/** 航点变更后：已编目成果标为待复核，导出暂停 */
function touchMission(missionId: string): void {
  if (!missionId) return;
  void useMissionStore.getState().markReviewPending(missionId);
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
    await db.waypoints.put(record);
    set({ items: [...get().items, record] });
    touchMission(record.missionId);
    return record;
  },
  async addMany(drafts) {
    const records: Waypoint[] = drafts.map((d) => ({ ...d, id: newId('wp') }));
    await db.waypoints.bulkPut(records);
    set({ items: [...get().items, ...records] });
    const missionIds = new Set(records.map((r) => r.missionId));
    missionIds.forEach(touchMission);
    return records;
  },
  async update(id, patch) {
    await db.waypoints.update(id, patch);
    set({ items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
    const missionId = get().items.find((it) => it.id === id)?.missionId;
    touchMission(missionId ?? '');
  },
  /** 与相邻航点交换序号 */
  async move(id, direction) {
    const list = get().byMission(get().items.find((it) => it.id === id)?.missionId ?? '');
    const index = list.findIndex((it) => it.id === id);
    const target = direction === 'up' ? list[index - 1] : list[index + 1];
    if (!target) return;
    await get().reorder(id, target.id);
  },
  async reorder(fromId, toId) {
    const from = get().items.find((it) => it.id === fromId);
    const to = get().items.find((it) => it.id === toId);
    if (!from || !to) return;
    const fromSeq = from.seq;
    await db.waypoints.update(from.id, { seq: to.seq });
    await db.waypoints.update(to.id, { seq: fromSeq });
    set({
      items: get().items.map((it) => {
        if (it.id === from.id) return { ...it, seq: to.seq };
        if (it.id === to.id) return { ...it, seq: fromSeq };
        return it;
      }),
    });
    touchMission(from.missionId);
  },
  async removeByMission(missionId) {
    const ids = get().items.filter((it) => it.missionId === missionId).map((it) => it.id);
    await db.waypoints.bulkDelete(ids);
    set({ items: get().items.filter((it) => it.missionId !== missionId) });
    touchMission(missionId);
  },
  async remove(id) {
    const missionId = get().items.find((it) => it.id === id)?.missionId;
    await db.waypoints.delete(id);
    set({ items: get().items.filter((it) => it.id !== id) });
    touchMission(missionId ?? '');
  },
  byMission(missionId) {
    return get()
      .items.filter((it) => it.missionId === missionId)
      .sort((a, b) => a.seq - b.seq);
  },
}));
