import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    // T001 骨架期无测试文件，空跑须退出码 0；M1 起测试文件落地后此开关不再起作用
    passWithNoTests: true,
  },
});
