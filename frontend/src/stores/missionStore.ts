import { create } from 'zustand';
import { db } from '../utils/db';
import { newId } from '../utils/id';
import type { CameraPreset, Mission, MissionDraft, MissionStatus } from '../types/mission';

interface MissionState {
  items: Mission[];
  presets: CameraPreset[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (draft: MissionDraft) => Promise<Mission>;
  update: (id: string, patch: Partial<Mission>) => Promise<void>;
  setStatus: (id: string, status: MissionStatus) => Promise<void>;
  applyPreset: (missionId: string, presetId: string) => Promise<void>;
  /** 发布成功后把新版本号同步到本地状态（库内写入已在发布事务中完成） */
  applyVersion: (id: string, version: number) => void;
  addPreset: (draft: Omit<CameraPreset, 'id'>) => Promise<CameraPreset>;
  removePreset: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
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
  async add(draft) {
    const record: Mission = { ...draft, id: newId('mission'), version: 0, createdAt: Date.now() };
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
  applyVersion(id, version) {
    set({ items: get().items.map((it) => (it.id === id ? { ...it, version } : it)) });
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
}));
