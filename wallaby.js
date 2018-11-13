module.exports = function() {
  return {
    debug: true,

    files: [
      { pattern: 'node_modules/@types/**/*', instrument: false },
      'tsconfig.json',
      'src/**/*.ts',
      '!src/**/*.spec.ts'
    ],

    tests: ['src/**/*.spec.ts'],

    workers: {
      initial: 2,
      regular: 2,
      restart: true
    },

    env: {
      type: 'node',
      runner: 'node'
    },

    testFramework: 'jest',

    setup: function() {
      process.env.POSTGRES_USER = 'postgremote';
      process.env.POSTGRES_DB = 'postgremote';
      process.env.POSTGRES_PASSWORD = '';
    }
  };
};
