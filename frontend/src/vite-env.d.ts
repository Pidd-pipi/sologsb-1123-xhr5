/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 高德地图 JS API Key；留空时页面自动使用本地 SVG 网格视图 */
  readonly VITE_AMAP_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
