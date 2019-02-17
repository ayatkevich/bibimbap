const { Client } = require('pg');
require('dotenv').config();

module.exports = function(wallaby) {
  var path = require('path');
  process.env.NODE_PATH +=
    path.delimiter +
    path.join(wallaby.localProjectDir, 'postgremote', 'node_modules') +
    path.delimiter +
    path.join(wallaby.localProjectDir, 'designpad', 'node_modules');

  return {
    debug: true,

    files: [
      { pattern: '.env', instrument: false },
      { pattern: 'node_modules/@types/**/*', instrument: false },
      { pattern: 'packages/**/*.snap', instrument: false },
      { pattern: 'packages/**/node_modules/**', ignore: true },
      'tsconfig.json',
      'packages/**/*.ts',
      '!packages/**/*.spec.ts'
    ],

    tests: ['packages/**/*.spec.ts'],

    env: {
      type: 'node'
    },

    testFramework: 'jest',

    setup: function(w) {
      require('dotenv').config();

      let jestConfig = global._modifiedJestConfig;
      if (!jestConfig) {
        jestConfig = global._modifiedJestConfig = require('./package.json').jest;
        const path = require('path');
        const globby = require('globby');

        jestConfig.moduleNameMapper = globby
          .sync(path.join(w.projectCacheDir, 'packages/*/package.json'))
          .reduce((acc, v) => {
            const packageJsonPath = v;
            acc[`^${require(packageJsonPath).name}(.*)`] = `${path.dirname(
              packageJsonPath
            )}$1`;
            return acc;
          }, {});
      }
      wallaby.testFramework.configure(jestConfig);
    },

    teardown: async function(w) {
      const client = new Client();
      try {
        await client.connect();
  
        const res = await client.query(
          `
            select pg_terminate_backend(pg_stat_activity.pid)
            from pg_stat_activity
            where pg_stat_activity.datname = $1
              and pid <> pg_backend_pid()
          `,
          [process.env.PGDATABASE]
        );
      } finally {
        await client.end();
      }
    }
  };
};
