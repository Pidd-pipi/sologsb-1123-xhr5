/** 成果影像质量 */
export type ImageQuality = '合格' | '模糊' | '过曝';

export const IMAGE_QUALITIES: ImageQuality[] = ['合格', '模糊', '过曝'];

/** 成果影像条目 */
export interface ImageAsset {
  id: string;
  missionId: string;
  /** 影像片号 */
  imageNo: string;
  lng: number;
  lat: number;
  /** 航高 m */
  altitude: number;
  /** 实际 GSD cm/px */
  gsd: number;
  /** 实际重叠 % */
  overlap: number;
  /** 倾角 ° */
  tiltAngle: number;
  shotAt: number;
  quality: ImageQuality;
  /** 归档目录 */
  folder: string;
}

export type ImageAssetDraft = Omit<ImageAsset, 'id'>;

/** 缩略图（单独建表存放 dataUrl） */
export interface AssetThumb {
  /** 与影像条目 id 一一对应 */
  id: string;
  missionId: string;
  dataUrl: string;
}

/** 本地生成缩略图（不依赖网络） */
export function makeThumbDataUrl(imageNo: string, quality: ImageQuality, lng: number, lat: number): string {
  const tone = quality === '合格' ? '#2f6f4f' : quality === '模糊' ? '#8a6d1f' : '#8a3b2f';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160">
  <rect width="240" height="160" fill="${tone}"/>
  <path d="M0 120 L60 96 L120 126 L180 84 L240 110 L240 160 L0 160 Z" fill="#20303a" opacity="0.55"/>
  <circle cx="196" cy="34" r="16" fill="#f2d98a" opacity="0.85"/>
  <text x="10" y="26" font-size="15" fill="#ffffff" font-family="sans-serif">${imageNo}</text>
  <text x="10" y="48" font-size="12" fill="#e6f0ff" font-family="sans-serif">${quality} · ${lng.toFixed(5)}, ${lat.toFixed(5)}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
