import { db } from './db';
import type { FlightLine } from '../types/flightline';
import type { ReviewStatus } from '../types/imageasset';

/** 发布结果：ok=false 时 currentVersion 为库中当前版本（后到版本被打回） */
export interface PublishResult {
  ok: boolean;
  version?: number;
  currentVersion?: number;
  /** 写入异常导致回滚 */
  error?: boolean;
}

const CHANNEL_NAME = 'gbdronemap-version-sync';

type VersionEvent =
  | { type: 'mission-published'; missionId: string; version: number }
  | { type: 'mission-changed'; missionId: string; version?: number }
  | { type: 'publish-rollback'; missionId: string };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/** 广播版本事件（BroadcastChannel 不回发给自己，仅通知其他标签页） */
export function broadcastVersionEvent(event: VersionEvent): void {
  try {
    getChannel()?.postMessage(event);
  } catch {
    /* 广播不可用时忽略 */
  }
}

/** 订阅其他标签页的版本事件 */
export function onVersionEvent(handler: (event: VersionEvent) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const listener = (e: MessageEvent) => handler(e.data as VersionEvent);
  ch.addEventListener('message', listener);
  return () => ch.removeEventListener('message', listener);
}

/**
 * 航线参数/航点变更后：已编目成果标为待复核，导出暂停。
 * 与复核状态写在同一事务，失败整体回滚。
 */
export async function markReviewPending(missionId: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.missions, db.assets], async () => {
    await db.missions.update(missionId, { reviewPending: true, routeUpdatedAt: now });
    await db.assets.where('missionId').equals(missionId).modify({ reviewStatus: 'pending' as ReviewStatus });
  });
  broadcastVersionEvent({ type: 'mission-changed', missionId });
}

/** 重新确认：恢复导出（不递增版本） */
export async function confirmReview(missionId: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', [db.missions, db.assets], async () => {
    await db.missions.update(missionId, { reviewPending: false, reviewConfirmedAt: now });
    await db.assets.where('missionId').equals(missionId).modify({ reviewStatus: 'confirmed' as ReviewStatus });
  });
  broadcastVersionEvent({ type: 'mission-changed', missionId });
}

/**
 * 保存航线参数（乐观并发控制）。
 * 保存前核对版本：expectedVersion 与库中当前版本不一致则打回（返回 ok=false），
 * 不覆盖原内容。版本一致才在同一事务内：保存航线参数 + 版本 +1 + 成果标为待复核
 * （参数变化 → 成果需重新核对，导出暂停）。
 * 写入异常时 Dexie 事务 abort 回滚，原版本与影像质量都保留。
 */
export async function saveRouteParams(
  missionId: string,
  expectedVersion: number,
  line: FlightLine,
): Promise<PublishResult> {
  const now = Date.now();
  try {
    const result = await db.transaction('rw', [db.missions, db.assets, db.lines], async () => {
      const mission = await db.missions.get(missionId);
      if (!mission) throw new Error('mission-not-found');
      if (mission.version !== expectedVersion) {
        // 后到版本：打回，不覆盖原内容
        return { ok: false as const, currentVersion: mission.version };
      }
      const nextVersion = mission.version + 1;
      await db.lines.put(line);
      await db.missions.update(missionId, {
        version: nextVersion,
        reviewPending: true,
        routeUpdatedAt: now,
      });
      await db.assets.where('missionId').equals(missionId).modify({ reviewStatus: 'pending' as ReviewStatus });
      return { ok: true as const, version: nextVersion };
    });
    if (result.ok) {
      broadcastVersionEvent({ type: 'mission-changed', missionId, version: result.version as number });
    }
    return result;
  } catch (err) {
    // 事务已回滚，广播让其他标签页重新同步，保留原版本与影像质量
    broadcastVersionEvent({ type: 'publish-rollback', missionId });
    return { ok: false, error: true };
  }
}

/**
 * 发布新版本（乐观并发控制）。
 *
 * 发布前核对版本：expectedVersion 与库中当前版本不一致则打回（返回 ok=false），
 * 不覆盖原内容、不动航线参数与成果。版本一致才在同一事务内：
 * 保存航线参数 + 版本 +1 + 解除待复核 + 成果恢复确认。
 * 写入异常时 Dexie 事务 abort 回滚，原版本与影像质量都保留。
 */
export async function publishVersion(
  missionId: string,
  expectedVersion: number,
  line?: FlightLine,
): Promise<PublishResult> {
  const now = Date.now();
  try {
    const result = await db.transaction('rw', [db.missions, db.assets, db.lines], async () => {
      const mission = await db.missions.get(missionId);
      if (!mission) throw new Error('mission-not-found');
      if (mission.version !== expectedVersion) {
        // 后到版本：打回，不覆盖原内容
        return { ok: false as const, currentVersion: mission.version };
      }
      const nextVersion = mission.version + 1;
      if (line) await db.lines.put(line);
      await db.missions.update(missionId, {
        version: nextVersion,
        reviewPending: false,
        reviewConfirmedAt: now,
      });
      await db.assets.where('missionId').equals(missionId).modify({ reviewStatus: 'confirmed' as ReviewStatus });
      return { ok: true as const, version: nextVersion };
    });
    if (result.ok) {
      broadcastVersionEvent({ type: 'mission-published', missionId, version: result.version as number });
    }
    return result;
  } catch (err) {
    // 事务已回滚，广播让其他标签页重新同步，保留原版本与影像质量
    broadcastVersionEvent({ type: 'publish-rollback', missionId });
    return { ok: false, error: true };
  }
}
