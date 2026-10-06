/** 发布触发来源 */
export type ReleaseSource = '航线参数' | '航点';

/**
 * 一次任务发布记录：把航线参数、航点与已编目成果绑定为同一份版本。
 * 只追加不修改，作为版本审计轨迹。
 */
export interface MissionRelease {
  id: string;
  missionId: string;
  /** 发布后的版本号 */
  version: number;
  source: ReleaseSource;
  /** 发布时的航点数量 */
  waypointCount: number;
  /** 发布时已编目成果数量（同步转为待复核） */
  assetCount: number;
  createdAt: number;
}
