import { Pool } from 'pg';
import { jsql } from './jsql';
import { config, databaseConnectionPool, exec } from './client';

describe(`postgremote client`, () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      user: process.env.POSTGRES_USER,
      host: 'localhost',
      database: process.env.POSTGRES_DB,
      password: process.env.POSTGRES_PASSWORD
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it(`should provide method to set up pg pool`, () => {
    config(pool);
    expect(databaseConnectionPool).toBe(pool);
  });

  it(`should be able to make a simple query`, async () => {
    const PgRoles = jsql.table('pg_roles', [
      jsql.column('rolname', { type: String })
    ]);

    const result = await exec(
      jsql.select([PgRoles.rolname], { from: PgRoles })
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rolname: process.env.POSTGRES_USER })
      ])
    );
  });
});
