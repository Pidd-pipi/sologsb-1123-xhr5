/** 航点动作 */
export type WaypointAction = '拍照' | '悬停' | '转弯';

export const WAYPOINT_ACTIONS: WaypointAction[] = ['拍照', '悬停', '转弯'];

/** 航点 */
export interface Waypoint {
  id: string;
  missionId: string;
  seq: number;
  lng: number;
  lat: number;
  /** 相对航高 m */
  altitude: number;
  /** 航速 m/s */
  speed: number;
  /** 航向 ° */
  heading: number;
  /** 云台俯仰 ° */
  gimbalPitch: number;
  action: WaypointAction;
  /** 悬停秒数 */
  hoverSec: number;
}

export type WaypointDraft = Omit<Waypoint, 'id'>;

/** 解析粘贴导入文本：每行 "经度,纬度[,航高]" 或 "纬度 经度" 自动判别 */
export function parseWaypointText(text: string): { lng: number; lat: number; altitude?: number }[] {
  const rows: { lng: number; lat: number; altitude?: number }[] = [];
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const parts = line.split(/[,\s\t;]+/).map((p) => Number(p)).filter((n) => Number.isFinite(n));
      if (parts.length < 2) return;
      let [a, b, c] = parts;
      // 中国境内经度 73~136、纬度 3~54；若首个数落在纬度范围而第二个落在经度范围，则交换
      const aIsLng = a >= 73 && a <= 136;
      const bIsLng = b >= 73 && b <= 136;
      let lng = a;
      let lat = b;
      if (!aIsLng && bIsLng) {
        lng = b;
        lat = a;
      }
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return;
      rows.push(c !== undefined ? { lng, lat, altitude: c } : { lng, lat });
    });
  return rows;
}
