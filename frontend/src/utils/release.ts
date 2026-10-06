import { db } from './db';
import { newId } from './id';
import type { MissionRelease, ReleaseSource } from '../types/release';

/** 发布结果：成功拿到新版本号；版本冲突被打回；写入失败已回滚 */
export type PublishResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'conflict'; currentVersion: number }
  | { ok: false; reason: 'error'; message: string };

export interface PublishInput {
  missionId: string;
  /** 本次编辑所基于的版本号（保存前核对） */
  baseVersion: number;
  source: ReleaseSource;
  /** 事务内执行的写入（航线参数 / 航点） */
  apply: () => Promise<void>;
}

/** 跨标签页同步消息 */
export interface MissionSyncMessage {
  type: 'release' | 'assets-confirmed';
  missionId: string;
  version: number;
  at: number;
}

const SYNC_CHANNEL = 'gbdronemap:mission-sync';

/** 发布 / 重新确认后广播，其他标签页收到后重载本地数据 */
export function notifyMissionSync(msg: Omit<MissionSyncMessage, 'at'>): void {
  try {
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channel.postMessage({ ...msg, at: Date.now() } satisfies MissionSyncMessage);
    channel.close();
  } catch {
    /* BroadcastChannel 不可用时仅靠保存前的版本核对兜底 */
  }
}

/** 订阅其他标签页的发布动态；返回取消订阅函数 */
export function onMissionSync(handler: (msg: MissionSyncMessage) => void): () => void {
  try {
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channel.onmessage = (event) => handler(event.data as MissionSyncMessage);
    return () => channel.close();
  } catch {
    return () => {};
  }
}

/**
 * 发布任务变更，把航线参数、航点与已编目成果绑成同一份版本：
 * 单个事务内 核对版本 → 写入 → 已编目成果转「待复核」→ 记录发布 → 版本 +1。
 * - 版本不一致（其他标签页已先发布）：先到的那份已生效，后到版本被打回，不写入、不覆盖原内容；
 * - 任一步骤写失败：整个事务回滚，原版本号与成果影像质量（quality）都保持原值。
 */
export async function publishMissionChange(input: PublishInput): Promise<PublishResult> {
  const { missionId, baseVersion, source, apply } = input;
  try {
    const result = await db.transaction(
      'rw',
      [db.missions, db.lines, db.waypoints, db.assets, db.releases],
      async (): Promise<PublishResult> => {
        const mission = await db.missions.get(missionId);
        if (!mission) return { ok: false, reason: 'error', message: '任务不存在或已被删除' };
        const currentVersion = mission.version ?? 0;
        if (currentVersion !== baseVersion) {
          // 后到版本打回：事务内未做任何写入，直接返回冲突
          return { ok: false, reason: 'conflict', currentVersion };
        }
        await apply();
        // 参数 / 航点变化后：已编目成果标为待复核（只动复核状态，保留质量标记）
        const assets = await db.assets.where('missionId').equals(missionId).toArray();
        for (const asset of assets) {
          if (asset.reviewStatus !== '待复核') {
            await db.assets.update(asset.id, { reviewStatus: '待复核' });
          }
        }
        const nextVersion = baseVersion + 1;
        const release: MissionRelease = {
          id: newId('release'),
          missionId,
          version: nextVersion,
          source,
          waypointCount: await db.waypoints.where('missionId').equals(missionId).count(),
          assetCount: assets.length,
          createdAt: Date.now(),
        };
        await db.releases.put(release);
        await db.missions.update(missionId, { version: nextVersion });
        return { ok: true, version: nextVersion };
      },
    );
    if (result.ok) {
      notifyMissionSync({ type: 'release', missionId, version: result.version });
    }
    return result;
  } catch (err) {
    // Dexie 事务随异常自动回滚：版本号、航线参数、航点与成果（含质量）全部保持原值
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/** 重新确认：把待复核成果按当前版本标回「已确认」，恢复导出 */
export async function confirmMissionAssets(
  missionId: string,
): Promise<{ ok: boolean; confirmed: number; version: number }> {
  try {
    return await db.transaction('rw', [db.missions, db.assets], async () => {
      const mission = await db.missions.get(missionId);
      const version = mission?.version ?? 0;
      const rows = await db.assets.where('missionId').equals(missionId).toArray();
      let confirmed = 0;
      for (const row of rows) {
        if (row.reviewStatus === '待复核') {
          await db.assets.update(row.id, { reviewStatus: '已确认', confirmedVersion: version });
          confirmed += 1;
        }
      }
      return { ok: true, confirmed, version };
    });
  } catch {
    return { ok: false, confirmed: 0, version: 0 };
  }
}
