/** 航拍用途 */
export type MissionPurpose = '正射' | '倾斜' | '带状';

export const MISSION_PURPOSES: MissionPurpose[] = ['正射', '倾斜', '带状'];

export type MissionStatus = '规划中' | '待飞行' | '已飞行' | '已归档';

export const MISSION_STATUSES: MissionStatus[] = ['规划中', '待飞行', '已飞行', '已归档'];

/** 经纬度点 */
export type LngLat = [number, number];

/** 航拍任务 */
export interface Mission {
  id: string;
  /** 任务编号 */
  missionNo: string;
  name: string;
  /** 测区名称 */
  areaName: string;
  /** 测区边界经纬度数组 */
  areaPolygon: LngLat[];
  purpose: MissionPurpose;
  droneModel: string;
  cameraModel: string;
  /** 传感器宽度 mm */
  sensorWidth: number;
  /** 传感器高度 mm */
  sensorHeight: number;
  /** 焦距 mm */
  focalLength: number;
  /** 像元尺寸 μm */
  pixelSize: number;
  flightDate: string;
  pilot: string;
  status: MissionStatus;
  /** 发布版本号：航线参数 / 航点每次发布 +1，旧任务迁移补 0 */
  version: number;
  createdAt: number;
}

export type MissionDraft = Omit<Mission, 'id' | 'createdAt' | 'version'>;

/** 相机预设 */
export interface CameraPreset {
  id: string;
  name: string;
  cameraModel: string;
  sensorWidth: number;
  sensorHeight: number;
  focalLength: number;
  pixelSize: number;
}
