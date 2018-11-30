import {
  escape,
  escapeId,
  jsql,
  JSQLError,
  QueryKind,
  Timestamp
} from './jsql';

const removeSpaces = (string: string) =>
  string.replace(/\s\s+/gm, ' ').replace(/(\(\s|\s\))/g, match => match.trim());

describe(`DSL`, () => {
  describe(`escaping`, () => {
    it(`should escape string constants using C-style escapes`, () => {
      expect(escape(`This is sql string " ' \" \' \` $$ $ hahaha \n `)).toBe(
        `E'This is sql string \\" \\' \\" \\' \\\` \\$\\$ \\$ hahaha \\n '`
      );
    });

    it(`should escape query identifiers with double quote`, () => {
      expect(escapeId('TableName')).toBe('"TableName"');
      expect(escapeId('property')).toBe('"property"');
      expect(escapeId('UserTable.property')).toBe('"UserTable"."property"');
    });

    it(`should not allow to use special characters for query identifiers`, () => {
      expect(() => escapeId("'")).toThrow();
      expect(() => escapeId('"')).toThrow();
      expect(() => escapeId('&')).toThrow();
      expect(() => escapeId(';')).toThrow();
      expect(() => escapeId('%')).toThrow();
      expect(() => escapeId('$')).toThrow();
    });

    it(`should not allow any other value except string`, () => {
      expect(() =>
        // @ts-ignore
        escape(124)
      ).toThrow();

      expect(() =>
        // @ts-ignore
        escapeId(124)
      ).toThrow();
    });
  });

  describe(`functions`, () => {
    test(`select "login"()`, () => {
      const login = jsql.function('login', [], Boolean);
      expect(login({}).toQueryObject()).toEqual({
        text: `select "login"()`,
        values: []
      });
    });

    test(`select "login"($1, $2)`, () => {
      const login = jsql.function(
        'login',
        [
          jsql.column('username', { type: String }),
          jsql.column('password', { type: String, defaultable: true })
        ],
        Boolean
      );

      expect(
        login({ username: 'username', password: 'password' }).toQueryObject()
      ).toEqual({
        text: `select "login"($1, $2)`,
        values: ['username', 'password']
      });

      expect(
        login({ password: 'password', username: 'username' }).toQueryObject()
      ).toEqual({
        text: `select "login"($1, $2)`,
        values: ['username', 'password']
      });

      expect(login({ username: 'username' }).toQueryObject()).toEqual({
        text: `select "login"($1, $2)`,
        values: ['username', null]
      });
    });
  });

  describe(`select`, () => {
    it(`should implement JSQLQuery type, otherwise throw error`, () => {
      expect(() => {
        // @ts-ignore: Statically incorrect argument type
        jsql();
      }).toThrowError(JSQLError);

      expect(() => {
        // @ts-ignore: Statically incorrect argument type
        jsql({});
      }).toThrowError(JSQLError);
    });

    it(`should setup from, otherwise throw error`, () => {
      const TableName = jsql.table('TableName', [
        jsql.column('column', { type: String })
      ]);

      expect(() => {
        // @ts-ignore
        jsql.select([TableName.column]).toJSQL();
      }).toThrowError(JSQLError);
    });

    it(`should not allow use select expression without from statement`, () => {
      const TableName = jsql.table('TableName', [
        jsql.column('column', { type: String })
      ]);

      expect(() => {
        jsql(
          // @ts-ignore
          {
            kind: QueryKind.SELECT,
            select: [TableName.column]
          }
        );
      }).toThrowError(JSQLError);
    });

    test(`select "TableName".* from "TableName"`, () => {
      const TableName = jsql.table('TableName', [
        jsql.column('column', { type: String })
      ]);

      expect(
        jsql.select([TableName['*']], { from: [TableName] }).toQueryObject()
      ).toEqual({ text: `select "TableName".* from "TableName"`, values: [] });
    });

    test(`select "User"."firstName", "User"."lastName" from "User"`, () => {
      const User = jsql.table('User', [
        jsql.column('firstName', {
          type: String,
          nullable: true
        }),
        jsql.column('lastName', {
          type: String,
          nullable: true
        })
      ]);

      expect(
        jsql
          .select([User.firstName, User.lastName], { from: [User] })
          .toQueryObject()
      ).toEqual({
        text: `select "User"."firstName", "User"."lastName" from "User"`,
        values: []
      });
    });

    test(`select "User"."username" as "firstName", "User"."lastName" from "User"`, () => {
      const User = jsql.table('User', [
        jsql.column('username', { type: String }),
        jsql.column('lastName', { type: String })
      ]);

      expect(
        jsql
          .select([jsql.as(User.username, 'firstName'), User.lastName], {
            from: [User]
          })
          .toQueryObject()
      ).toEqual({
        text: `select "User"."username" as "firstName", "User"."lastName" from "User"`,
        values: []
      });
    });

    test(`select "T1"."a", "T2"."b" from "T1", "T2"`, () => {
      const T1 = jsql.table('T1', [jsql.column('a', { type: String })]);
      const T2 = jsql.table('T2', [jsql.column('b', { type: String })]);

      expect(
        jsql.select([T1.a, T2.b], { from: [T1, T2] }).toQueryObject()
      ).toEqual({
        text: `select "T1"."a", "T2"."b" from "T1", "T2"`,
        values: []
      });
    });

    test(`select "User"."name" from "User"
        where (
          ("User"."email" = $1) and (
            ("User"."createdTime" > (current_timestamp - cast($2 as interval))) or
            ("User"."modifiedTime" < (current_timestamp - cast($3 as interval)))
          )
        ) or ("User"."inactive" = $4)`, () => {
      const User = jsql.table('User', [
        jsql.column('name', { type: String }),
        jsql.column('email', { type: String }),
        jsql.column('createdTime', { type: Timestamp }),
        jsql.column('modifiedTime', { type: Timestamp }),
        jsql.column('inactive', { type: Boolean })
      ]);

      const yesterday = jsql.subtraction(
        Timestamp.now(),
        Timestamp.interval('1 day')
      );

      expect(
        jsql
          .select([User.name], {
            from: [User],
            where: jsql.or(
              jsql.and(
                jsql.equalTo(User.email, 'name@example.com'),
                jsql.or(
                  jsql.greaterThan(User.createdTime, yesterday),
                  jsql.lessThan(User.modifiedTime, yesterday)
                )
              ),
              jsql.equalTo(User.inactive, true)
            )
          })
          .toQueryObject()
      ).toEqual({
        text: removeSpaces(`select "User"."name" from "User"
          where (
            ("User"."email" = $1) and (
              ("User"."createdTime" > (current_timestamp - cast($2 as interval))) or
              ("User"."modifiedTime" < (current_timestamp - cast($3 as interval)))
            )
          ) or ("User"."inactive" = $4)`),
        values: ['name@example.com', '1 day', '1 day', true]
      });
    });
  });

  describe(`insert`, () => {
    test(`insert into "User" ("firstName", "lastName") values ($1, $2)`, () => {
      const User = jsql.table('User', [
        jsql.column('firstName', { type: String }),
        jsql.column('lastName', { type: String })
      ]);

      expect(
        jsql
          .insert(User, {
            firstName: 'Alexander',
            lastName: 'Yatkevich'
          })
          .toQueryObject()
      ).toEqual({
        text: `insert into "User" ("firstName", "lastName") values ($1, $2)`,
        values: ['Alexander', 'Yatkevich']
      });
    });

    it(`should throw an error if you try to insert a value
        for a column that does not exist`, () => {
      const TestTable = jsql.table('TestTable', [
        jsql.column('testColumn', { type: String })
      ]);
      expect(() => {
        jsql
          .insert(TestTable, {
            // @ts-ignore
            testColumn2: 'value'
          })
          .toQueryObject();
      }).toThrowError(JSQLError);
    });

    it(`should not allow you to create an insert with no columns`, () => {
      const TestTable = jsql.table('TestTable', [
        jsql.column('testColumn', { type: String, nullable: true })
      ]);
      expect(() => {
        jsql.insert(TestTable, {}).toJSQL();
      }).toThrowError(JSQLError);
    });
  });
});
