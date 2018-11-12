import ts from 'typescript';
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
        let resultFile = ts.createSourceFile(
          'someFileName.ts',
          '',
          ts.ScriptTarget.Latest,
          false,
          ts.ScriptKind.TS
        );

        const printer = ts.createPrinter({
          newLine: ts.NewLineKind.LineFeed
        });

        const { rows: tables } = await client.query(
          `select *
            from information_schema.tables
            where table_schema = ANY($1::name[])`,
          [schemas]
        );

        let tableDeclarations = [];
        for (const table of tables) {
          const { rows: columns } = await client.query(
            `select *
              from information_schema.columns
              where table_name = $1`,
            [table.table_name]
          );

          let columnDeclarations = [];
          for (const column of columns) {
            columnDeclarations.push(
              ts.createCall(
                ts.createPropertyAccess(ts.createIdentifier('jsql'), 'column'),
                undefined,
                [
                  ts.createLiteral(column.column_name),
                  ts.createObjectLiteral([
                    ts.createPropertyAssignment(
                      ts.createIdentifier('type'),
                      ts.createIdentifier('String')
                    )
                  ])
                ]
              )
            );
          }

          tableDeclarations.push(
            ts.createVariableStatement(
              [ts.createModifier(ts.SyntaxKind.ExportKeyword)],
              ts.createVariableDeclarationList(
                [
                  ts.createVariableDeclaration(
                    table.table_name,
                    undefined,
                    ts.createCall(
                      ts.createPropertyAccess(
                        ts.createIdentifier('jsql'),
                        'table'
                      ),
                      undefined,
                      [
                        ts.createLiteral(
                          `${table.table_schema}.${table.table_name}`
                        ),
                        ts.createArrayLiteral(columnDeclarations)
                      ]
                    )
                  )
                ],
                ts.NodeFlags.Const
              )
            )
          );
        }

        resultFile = ts.updateSourceFileNode(
          resultFile,
          ts.setTextRange(
            ts.createNodeArray([
              ts.createImportDeclaration(
                undefined,
                undefined,
                ts.createImportClause(ts.createIdentifier('jsql'), undefined),
                ts.createLiteral('postgremote/jsql')
              ),
              ...tableDeclarations
            ]),
            resultFile.statements
          )
        );

        return prettier.format(printer.printFile(resultFile), {
          singleQuote: true,
          parser: 'typescript'
        });
      };

      // so when we run our generator we should get a typescript code
      expect(await generator([schema])).toMatchInlineSnapshot(`
"import jsql from 'postgremote/jsql';
export const Table0 = jsql.table('myOwnUniqueSchema.Table0', [
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
