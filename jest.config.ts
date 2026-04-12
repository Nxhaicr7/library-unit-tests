import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/services/**/*.ts',
    '!src/services/index.ts',
  ],
  coverageReporters: ['text', 'lcov', 'clover'],
  testPathPattern: 'tests/.*\\.test\\.ts$',
};

export default config;
