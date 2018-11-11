import prettier from 'prettier';
import { Pool } from 'pg';
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

  it(`should generate nothing if there is nothing
      in the selected schema`, async () => {
    const schema = 'myOwnUniqueSchema';
    const client = await pool.connect();

    // so let's create a schema
    await client.query(`create schema if not exists ${escapeId(schema)}`);

    try {
      // we'll need a few tables
      const prerequisites = ['char(1)', 'text', 'varchar(1)'].map((item, i) => [
        `Table${i}`,
        `column${i}`,
        item
      ]);
      for (const [tableName, columnName, type] of prerequisites) {
        await client.query(`
          create table ${escapeId(schema)}.${escapeId(tableName)} (
            ${escapeId(columnName)} ${type}
          )
        `);
      }

      const generator = async (schemas: string[]) => {
        const { rows: tables } = await client.query(
          `select *
            from information_schema.tables
            where table_schema = ANY($1::name[])`,
          [schemas]
        );

        let tablesDump = '';
        for (const table of tables) {
          const { rows: columns } = await client.query(
            `select *
              from information_schema.columns
              where table_name = $1`,
            [table.table_name]
          );
          let columnsDump = '';
          for (const column of columns) {
            columnsDump += `jsql.column('${
              column.column_name
            }', {type: String}),`;
          }

          tablesDump += `export const ${table.table_name} = jsql.table('${
            table.table_schema
          }.${table.table_name}', [${columnsDump}]);`;
        }

        return prettier.format(tablesDump, {
          singleQuote: true,
          parser: 'typescript'
        });
      };

      // so when we run our generator we should get a typescript code
      expect(await generator([schema])).toMatchInlineSnapshot(`
"export const Table0 = jsql.table('myOwnUniqueSchema.Table0', [
  jsql.column('column0', { type: String })
]);
export const Table1 = jsql.table('myOwnUniqueSchema.Table1', [
  jsql.column('column1', { type: String })
]);
export const Table2 = jsql.table('myOwnUniqueSchema.Table2', [
  jsql.column('column2', { type: String })
]);
"
`);
    } finally {
      // drops schema
      await client.query(`drop schema if exists ${escapeId(schema)} cascade`);
      client.release();
    }
  });
});
