module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  verbose: true,
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
  }
};
