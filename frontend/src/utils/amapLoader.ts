/**
 * 高德地图 JS API 加载器。
 * - key 从 `import.meta.env.VITE_AMAP_KEY` 读取，构建期不做任何校验（**构建不依赖 key**）。
 * - key 为空、脚本加载失败或超时 → resolve(null)，调用方自动退化为本地 SVG 网格视图。
 */

export interface AMapMap {
  add: (overlay: unknown) => void;
  remove: (overlay: unknown) => void;
  setFitView: () => void;
  destroy: () => void;
}

export interface AMapNamespace {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  Polygon: new (options: Record<string, unknown>) => unknown;
  Polyline: new (options: Record<string, unknown>) => unknown;
  Marker: new (options: Record<string, unknown>) => unknown;
  Rectangle: new (options: Record<string, unknown>) => unknown;
  Pixel: new (x: number, y: number) => unknown;
  LngLat: new (lng: number, lat: number) => unknown;
}

declare global {
  interface Window {
    AMap?: AMapNamespace;
  }
}

const SCRIPT_ID = 'amap-js-api';
const LOAD_TIMEOUT_MS = 8000;

export function readAmapKey(): string {
  const key = import.meta.env?.VITE_AMAP_KEY;
  return typeof key === 'string' ? key.trim() : '';
}

export function hasAmapKey(): boolean {
  return readAmapKey().length > 0;
}

let pending: Promise<AMapNamespace | null> | null = null;

/** 加载高德 JS API；未配置 key 时立即返回 null（不发起任何网络请求） */
export function loadAmap(): Promise<AMapNamespace | null> {
  if (!hasAmapKey()) return Promise.resolve(null);
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.AMap) return Promise.resolve(window.AMap);
  if (pending) return pending;

  pending = new Promise<AMapNamespace | null>((resolve) => {
    const finish = (value: AMapNamespace | null) => resolve(value);
    const timer = window.setTimeout(() => finish(window.AMap ?? null), LOAD_TIMEOUT_MS);
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(readAmapKey())}`;
    script.onload = () => {
      window.clearTimeout(timer);
      finish(window.AMap ?? null);
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    document.head.appendChild(script);
  });

  return pending;
}
