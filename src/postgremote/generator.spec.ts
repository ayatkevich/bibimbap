import 'typescript';
import { Pool, PoolClient } from 'pg';
import { generator } from './generator';
import { escape, escapeId } from './jsql';

describe('jsql code generator', () => {
  let pool: Pool;

  beforeAll(() => {
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

  beforeEach(() => {
    jest.resetModules();
  });

  it(`should generate javascript code out of selected schemas`, async () => {
    const schema = 'myOwnUniqueSchema';
    const client = await pool.connect();

    // so let's create a schema
    await client.query(`create schema if not exists ${escapeId(schema)}`);

    try {
      // we'll need a few tables
      await client.query(`
        create table ${escapeId(schema)}."Table0" (
          column0 text not null
        )
      `);
      await client.query(`
        create table ${escapeId(schema)}."Table1" (
          column0 char(1) default 'y'
        )
      `);
      await client.query(`
        create table ${escapeId(schema)}."Table2" (
          column0 varchar(100)
        )
      `);

      // so when we run our generator we should get a typescript code
      expect(await generator([schema])).toMatchInlineSnapshot(`
"import { jsql } from 'postgremote/jsql';
export const Table1 = jsql.table('myOwnUniqueSchema.Table1', [
  jsql.column('column0', { type: String, nullable: true, defaultable: true })
]);
export const Table0 = jsql.table('myOwnUniqueSchema.Table0', [
  jsql.column('column0', { type: String, nullable: false, defaultable: false })
]);
export const Table2 = jsql.table('myOwnUniqueSchema.Table2', [
  jsql.column('column0', { type: String, nullable: true, defaultable: false })
]);
"
`);
    } finally {
      // drops schema
      await client.query(`drop schema if exists ${escapeId(schema)} cascade`);
      client.release();
    }
  });

  const numberOfClientsConnected = async (client: PoolClient) => {
    const { rowCount } = await client.query(`
      select pg_stat_activity.pid
      from pg_stat_activity
      where pg_stat_activity.datname = ${escape(process.env
        .POSTGRES_DB as string)}
        and pid <> pg_backend_pid()`);
    return rowCount;
  };

  it(`should propagate error yet close connection`, async () => {
    const client = await pool.connect();
    try {
      const clientsBefore = await numberOfClientsConnected(client);

      jest.doMock('prettier', () => {
        return {
          format() {
            throw 'Here I am!';
          }
        };
      });
      const { generator: trickedOne } = require('./generator');

      await expect(trickedOne(['public'])).rejects.toMatchInlineSnapshot(
        `"Here I am!"`
      );

      const clientsAfter = await numberOfClientsConnected(client);

      expect(clientsAfter).toBe(clientsBefore);
    } finally {
      client.release();
    }
  });
});
