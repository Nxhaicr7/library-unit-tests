import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testPathIgnorePatterns: ['<rootDir>/tests/assessment/'],
  collectCoverageFrom: [
    'src/services/gorse.service.ts',
    'src/services/gemini.service.ts',
    'src/services/ollamaEmbedding.service.ts',
    'src/services/ollamaSummary.service.ts',
    'src/services/qdrant.service.ts',
    'src/services/notification.service.ts',
    'src/app/api/dashboard/stats/route.ts',
    'src/app/api/dashboard/alerts/route.ts',
    'src/app/api/dashboard/top-borrowed-books/route.ts',
    'src/app/api/dashboard/top-active-users/route.ts',
    'src/app/api/dashboard/borrowing-trend/route.ts',
    'src/app/api/dashboard/user-distribution/route.ts',
    'src/app/api/dashboard/book-copies-distribution/route.ts',
    'src/app/api/dashboard/borrow-request-distribution/route.ts',
    'src/workers/notification.worker.ts',
  ],
  coverageDirectory: '<rootDir>/coverage/unit',
  clearMocks: true,
};

export default config;
