import { Pool } from 'pg';
import 'typescript';
import { generator } from './generator';
import { escapeId } from './jsql';

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

      await client.query(`
        create or replace function ${escapeId(schema)}."function1"()
          returns boolean
        as $$ begin
          return true;
        end $$ language plpgsql;
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
export const function1 = jsql.function(
  'myOwnUniqueSchema.function1',
  [],
  Boolean
);
"
`);
    } finally {
      // drops schema
      await client.query(`drop schema if exists ${escapeId(schema)} cascade`);
      client.release();
    }
  });

  it(`should propagate error yet close connection`, async () => {
    const client = await pool.connect();
    try {
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
    } finally {
      client.release();
    }
  });
});
