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
          `
          select
            "Table"."tableName",
            "Table"."schemaName",
            json_agg("Columns".*) as "columns"
          from
            (select
              "Class".oid as "tableId",
              "Namespace".oid as "schemaId",
              "Class".relname as "tableName",
              "Namespace".nspname as "schemaName"
            from pg_namespace as "Namespace"
              left join pg_class as "Class"
                on "Class".relnamespace = "Namespace".oid
            where "Namespace".nspname = any($1::name[])
              and "Class".relkind in ('r', 'v', 'm', 'p', 'f')) as "Table"
            left join lateral (
              select attname as "columnName"
              from pg_attribute
              where attrelid = "Table"."tableId"
                and attnum > 0
            ) as "Columns" on true
          group by
            "Table"."tableName",
            "Table"."schemaName"
          `,
          [schemas]
        );

        let tableDeclarations = [];
        for (const table of tables) {
          let columnDeclarations = [];
          for (const column of table.columns) {
            columnDeclarations.push(
              ts.createCall(
                ts.createPropertyAccess(ts.createIdentifier('jsql'), 'column'),
                undefined,
                [
                  ts.createLiteral(column.columnName),
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
                    table.tableName,
                    undefined,
                    ts.createCall(
                      ts.createPropertyAccess(
                        ts.createIdentifier('jsql'),
                        'table'
                      ),
                      undefined,
                      [
                        ts.createLiteral(
                          `${table.schemaName}.${table.tableName}`
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
                ts.createImportClause(
                  undefined,
                  ts.createNamedImports([
                    ts.createImportSpecifier(
                      undefined,
                      ts.createIdentifier('jsql')
                    )
                  ])
                ),
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
"import { jsql } from 'postgremote/jsql';
export const Table1 = jsql.table('myOwnUniqueSchema.Table1', [
  jsql.column('column1', { type: String })
]);
export const Table0 = jsql.table('myOwnUniqueSchema.Table0', [
  jsql.column('column0', { type: String })
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
