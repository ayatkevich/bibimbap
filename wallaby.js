module.exports = function() {
  return {
    files: [
      { pattern:'node_modules/@types/**/*', instrument: false },
      'tsconfig.json',
      'src/**/*.ts',
      '!src/**/*.spec.ts'
    ],

    tests: ['src/**/*.spec.ts'],

    env: {
      type: 'node',
      runner: 'node'
    },

    testFramework: 'jest'
  };
};
