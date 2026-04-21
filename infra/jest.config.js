module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],
  moduleNameMapper: {
    '^@aws-sdk/(.*)$': '<rootDir>/node_modules/@aws-sdk/$1',
    '^mailparser$': '<rootDir>/node_modules/mailparser',
  },
};
