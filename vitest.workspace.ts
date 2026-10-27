import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/mini-app/vitest.config.ts',
  {
    test: {
      name: 'telegram-bot',
      environment: 'node',
      include: ['workers/telegram-bot/src/__tests__/**/*.test.ts'],
    },
  },
]);
