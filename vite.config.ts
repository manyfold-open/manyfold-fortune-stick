import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), cloudflare()],
  // 资源用相对路径引用，这样同一份构建既能挂在根目录，也能挂在 /fortune-stick/ 下。
  base: './',
  // 让 `PORT=… npm run dev` 生效，这样启动器分配的端口能被用上。
  server: { port: Number(process.env.PORT) || 5173 },
});
