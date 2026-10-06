import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 构建不读取、不校验 VITE_AMAP_KEY：未配置时运行期自动退化为本地 SVG 网格视图
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { outDir: 'dist', sourcemap: false },
});
