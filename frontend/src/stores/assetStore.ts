import { create } from 'zustand';
import { db } from '../utils/db';
import { newId } from '../utils/id';
import { confirmMissionAssets, notifyMissionSync } from '../utils/release';
import { makeThumbDataUrl, type AssetThumb, type ImageAsset, type ImageAssetDraft, type ImageQuality } from '../types/imageasset';

interface AssetState {
  items: ImageAsset[];
  thumbs: Record<string, string>;
  loaded: boolean;
  load: () => Promise<void>;
  addMany: (drafts: ImageAssetDraft[]) => Promise<ImageAsset[]>;
  update: (id: string, patch: Partial<ImageAsset>) => Promise<void>;
  markMany: (ids: string[], quality: ImageQuality) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  /** 发布成功后把本任务成果在本地标为待复核（库内写入已在发布事务中完成） */
  markMissionPendingReview: (missionId: string) => void;
  /** 重新确认：待复核成果按当前版本标回已确认，恢复导出 */
  confirmMission: (missionId: string) => Promise<{ ok: boolean; confirmed: number; version: number }>;
  byMission: (missionId: string) => ImageAsset[];
  qualityStats: (missionId: string) => { quality: ImageQuality; count: number }[];
}

export const useAssetStore = create<AssetState>((set, get) => ({
  items: [],
  thumbs: {},
  loaded: false,
  async load() {
    const rows = await db.assets.toArray();
    rows.sort((a, b) => a.imageNo.localeCompare(b.imageNo, 'zh-Hans-CN', { numeric: true }));
    const thumbRows = await db.thumbs.toArray();
    const thumbs: Record<string, string> = {};
    thumbRows.forEach((t) => {
      thumbs[t.id] = t.dataUrl;
    });
    set({ items: rows, thumbs, loaded: true });
  },
  async addMany(drafts) {
    const records: ImageAsset[] = drafts.map((d) => ({ ...d, id: newId('asset'), reviewStatus: '已确认' as const }));
    const thumbRecords: AssetThumb[] = records.map((r) => ({
      id: r.id,
      missionId: r.missionId,
      dataUrl: makeThumbDataUrl(r.imageNo, r.quality, r.lng, r.lat),
    }));
    // 缩略图单独建表存放
    await db.assets.bulkPut(records);
    await db.thumbs.bulkPut(thumbRecords);
    const nextThumbs = { ...get().thumbs };
    thumbRecords.forEach((t) => {
      nextThumbs[t.id] = t.dataUrl;
    });
    set({ items: [...get().items, ...records], thumbs: nextThumbs });
    return records;
  },
  async update(id, patch) {
    await db.assets.update(id, patch);
    set({ items: get().items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  },
  async markMany(ids, quality) {
    for (const id of ids) {
      await db.assets.update(id, { quality });
    }
    set({ items: get().items.map((it) => (ids.includes(it.id) ? { ...it, quality } : it)) });
  },
  async removeMany(ids) {
    await db.assets.bulkDelete(ids);
    await db.thumbs.bulkDelete(ids);
    const nextThumbs = { ...get().thumbs };
    ids.forEach((id) => {
      delete nextThumbs[id];
    });
    set({ items: get().items.filter((it) => !ids.includes(it.id)), thumbs: nextThumbs });
  },
  markMissionPendingReview(missionId) {
    set({
      items: get().items.map((it) => (it.missionId === missionId ? { ...it, reviewStatus: '待复核' as const } : it)),
    });
  },
  async confirmMission(missionId) {
    const result = await confirmMissionAssets(missionId);
    if (result.ok) {
      set({
        items: get().items.map((it) =>
          it.missionId === missionId && it.reviewStatus === '待复核'
            ? { ...it, reviewStatus: '已确认' as const, confirmedVersion: result.version }
            : it,
        ),
      });
      notifyMissionSync({ type: 'assets-confirmed', missionId, version: result.version });
    }
    return result;
  },
  byMission(missionId) {
    return get().items.filter((it) => it.missionId === missionId);
  },
  qualityStats(missionId) {
    const list = get().items.filter((it) => it.missionId === missionId);
    return (['合格', '模糊', '过曝'] as ImageQuality[]).map((quality) => ({
      quality,
      count: list.filter((it) => it.quality === quality).length,
    }));
  },
}));
