module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  verbose: true,
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  collectCoverageFrom: [
    'routes/**/*.js',
    'services/**/*.js'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/'
  ],
  moduleNameMapper: {
    '^uuid$': '<rootDir>/__mocks__/uuid.js',
    '^pdf-parse$': '<rootDir>/__mocks__/pdf-parse.js'
  },
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(chai)/)'
  ]
};
