import { create } from 'zustand';
import { db } from '../utils/db';
import { newId } from '../utils/id';
import { confirmReview as confirmReviewInDb, markReviewPending as markReviewPendingInDb, publishVersion, saveRouteParams } from '../utils/versionControl';
import type { PublishResult } from '../utils/versionControl';
import type { CameraPreset, Mission, MissionStatus } from '../types/mission';
import type { FlightLine } from '../types/flightline';

/** 新建任务时由 store 自动补版本与复核状态，调用方只需提供基础字段 */
export type MissionInput = Omit<Mission, 'id' | 'createdAt' | 'version' | 'reviewPending' | 'routeUpdatedAt' | 'reviewConfirmedAt'>;

interface MissionState {
  items: Mission[];
  presets: CameraPreset[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (draft: MissionInput) => Promise<Mission>;
  update: (id: string, patch: Partial<Mission>) => Promise<void>;
  setStatus: (id: string, status: MissionStatus) => Promise<void>;
  applyPreset: (missionId: string, presetId: string) => Promise<void>;
  addPreset: (draft: Omit<CameraPreset, 'id'>) => Promise<CameraPreset>;
  removePreset: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** 发布新版本（乐观并发控制）：expectedVersion 为该标签页编辑时的基线版本 */
  publish: (missionId: string, expectedVersion: number, line?: FlightLine) => Promise<PublishResult>;
  /** 保存航线参数（乐观并发控制）：保存后标成果待复核，版本 +1 */
  saveRouteParams: (missionId: string, expectedVersion: number, line: FlightLine) => Promise<PublishResult>;
  /** 重新确认复核：恢复导出 */
  confirmReview: (missionId: string) => Promise<void>;
  /** 航线参数/航点变更后：成果标为待复核，导出暂停 */
  markReviewPending: (missionId: string) => Promise<void>;
  /** 从库中重新拉取任务（跨标签页同步后调用） */
  resync: () => Promise<void>;
}

export const useMissionStore = create<MissionState>((set, get) => ({
  items: [],
  presets: [],
  loaded: false,
  async load() {
    const rows = await db.missions.orderBy('createdAt').reverse().toArray();
    const presets = await db.presets.toArray();
    set({ items: rows, presets, loaded: true });
  },
  async add(draft: MissionInput) {
    const record: Mission = { ...draft, id: newId('mission'), createdAt: Date.now(), version: 0, reviewPending: false, routeUpdatedAt: Date.now(), reviewConfirmedAt: Date.now() };
    await db.missions.put(record);
    set({ items: [record, ...get().items] });
    return record;
  },
  async update(id, patch) {
    await db.missions.update(id, patch);
    set({ items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  },
  async setStatus(id, status) {
    await get().update(id, { status });
  },
  async applyPreset(missionId, presetId) {
    const preset = get().presets.find((p) => p.id === presetId);
    if (!preset) return;
    await get().update(missionId, {
      cameraModel: preset.cameraModel,
      sensorWidth: preset.sensorWidth,
      sensorHeight: preset.sensorHeight,
      focalLength: preset.focalLength,
      pixelSize: preset.pixelSize,
    });
  },
  async addPreset(draft) {
    const record: CameraPreset = { ...draft, id: newId('preset') };
    await db.presets.put(record);
    set({ presets: [...get().presets, record] });
    return record;
  },
  async removePreset(id) {
    await db.presets.delete(id);
    set({ presets: get().presets.filter((p) => p.id !== id) });
  },
  async remove(id) {
    await db.missions.delete(id);
    set({ items: get().items.filter((it) => it.id !== id) });
  },
  async publish(missionId, expectedVersion, line) {
    const result = await publishVersion(missionId, expectedVersion, line);
    if (result.ok) {
      const now = Date.now();
      set({
        items: get().items.map((it) =>
          it.id === missionId
            ? { ...it, version: result.version as number, reviewPending: false, reviewConfirmedAt: now }
            : it,
        ),
      });
    }
    return result;
  },
  async saveRouteParams(missionId, expectedVersion, line) {
    const result = await saveRouteParams(missionId, expectedVersion, line);
    if (result.ok) {
      const now = Date.now();
      set({
        items: get().items.map((it) =>
          it.id === missionId
            ? { ...it, version: result.version as number, reviewPending: true, routeUpdatedAt: now }
            : it,
        ),
      });
    }
    return result;
  },
  async confirmReview(missionId) {
    await confirmReviewInDb(missionId);
    const now = Date.now();
    set({
      items: get().items.map((it) => (it.id === missionId ? { ...it, reviewPending: false, reviewConfirmedAt: now } : it)),
    });
  },
  async markReviewPending(missionId) {
    await markReviewPendingInDb(missionId);
    const now = Date.now();
    set({
      items: get().items.map((it) => (it.id === missionId ? { ...it, reviewPending: true, routeUpdatedAt: now } : it)),
    });
  },
  async resync() {
    const rows = await db.missions.orderBy('createdAt').reverse().toArray();
    set({ items: rows });
  },
}));

