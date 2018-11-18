module.exports = function() {
  return {
    debug: true,

    files: [
      { pattern: 'node_modules/@types/**/*', instrument: false },
      { pattern: 'src/**/*.snap', instrument: false },
      'tsconfig.json',
      'src/**/*.ts',
      '!src/**/*.spec.ts'
    ],

    tests: ['src/**/*.spec.ts'],

    workers: {
      initial: 4,
      regular: 4,
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
