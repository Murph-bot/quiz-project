import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // .netlify/functions-internal has a colliding package.json that hangs haste-map
  modulePathIgnorePatterns: ['<rootDir>/.netlify/', '<rootDir>/.next/'],
  testPathIgnorePatterns: ['<rootDir>/.netlify/', '<rootDir>/.next/', '<rootDir>/node_modules/'],
}

export default createJestConfig(config)
