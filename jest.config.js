const nextJest = require('next/jest');

// next/jest wires up the SWC transform using next.config.js, so no babel config
// is needed to run ESM `import` syntax in tests.
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  // These suites cover pure modules and API-route helpers — no DOM required.
  testEnvironment: 'node',
  // e2e/ holds Playwright specs, which must run via `npm run test:e2e`.
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/e2e/'],
};

module.exports = createJestConfig(config);
