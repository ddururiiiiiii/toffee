import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 앱 단위 테스트(2026-09-29) — 화면을 띄우지 않는 순수 로직만(src/**/*.test.ts). 화면 흐름은 e2e/(Playwright, 서버를 띄워 놓고 로컬에서)
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
