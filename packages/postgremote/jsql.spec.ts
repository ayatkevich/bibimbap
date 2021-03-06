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
          jsql.column('username', String),
          jsql.column('password', String, true)
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
        jsql.column('column', String)
      ]);

      expect(() => {
        // @ts-ignore
        jsql.select([TableName.column]).toJSQL();
      }).toThrowError(JSQLError);
    });

    it(`should not allow use select expression without from statement`, () => {
      const TableName = jsql.table('TableName', [
        jsql.column('column', String)
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
        jsql.column('column', String)
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
        jsql.column('username', String),
        jsql.column('lastName', String)
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
      const T1 = jsql.table('T1', [jsql.column('a', String)]);
      const T2 = jsql.table('T2', [jsql.column('b', String)]);

      expect(
        jsql.select([T1.a, T2.b], { from: [T1, T2] }).toQueryObject()
      ).toEqual({
        text: `select "T1"."a", "T2"."b" from "T1", "T2"`,
        values: []
      });
    });

    test(`select "User"."name" from "User"
          where (
            (
              (
                "User"."email" = $1
              ) and (
                (
                  "User"."createdTime" > (
                    current_timestamp - cast($2 as interval)
                  )
                ) or (
                  "User"."modifiedTime" < (
                    current_timestamp - cast($3 as interval)
                  )
                )
              )
            ) or (
              (
                "User"."rating" >= $4
              ) or (
                "User"."rating" <= $5
              )
            )
          ) or (
            "User"."inactive" = $6
          )`, () => {
      const User = jsql.table('User', [
        jsql.column('name', String),
        jsql.column('email', String),
        jsql.column('createdTime', Timestamp),
        jsql.column('modifiedTime', Timestamp),
        jsql.column('inactive', Boolean),
        jsql.column('rating', Number)
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
              jsql.or(
                jsql.and(
                  jsql.equalTo(User.email, 'name@example.com'),
                  jsql.or(
                    jsql.greaterThan(User.createdTime, yesterday),
                    jsql.lessThan(User.modifiedTime, yesterday)
                  )
                ),
                jsql.or(
                  jsql.greaterThanOrEqualTo(User.rating, 3),
                  jsql.lessThanOrEqualTo(User.rating, 5)
                )
              ),
              jsql.equalTo(User.inactive, true)
            )
          })
          .toQueryObject()
      ).toEqual({
        text: removeSpaces(`select "User"."name" from "User"
          where (
            (
              (
                "User"."email" = $1
              ) and (
                (
                  "User"."createdTime" > (
                    current_timestamp - cast($2 as interval)
                  )
                ) or (
                  "User"."modifiedTime" < (
                    current_timestamp - cast($3 as interval)
                  )
                )
              )
            ) or (
              (
                "User"."rating" >= $4
              ) or (
                "User"."rating" <= $5
              )
            )
          ) or (
            "User"."inactive" = $6
          )`),
        values: ['name@example.com', '1 day', '1 day', 3, 5, true]
      });
    });

    test(`select "Calc".* from "Calc"
          where (
            (
              ("Calc"."x" + "Calc"."y") = $1
            ) or (
              ("Calc"."x" * "Calc"."y") = $2
            )
          ) and (
            ("Calc"."x" / "Calc"."y") = $3
          )`, () => {
      const Calc = jsql.table('Calc', [
        jsql.column('x', Number),
        jsql.column('y', Number)
      ]);

      expect(
        jsql
          .select([Calc['*']], {
            from: [Calc],
            where: jsql.and(
              jsql.or(
                jsql.equalTo(jsql.addition(Calc.x, Calc.y), 10),
                jsql.equalTo(jsql.multiplication(Calc.x, Calc.y), 50)
              ),
              jsql.equalTo(jsql.division(Calc.x, Calc.y), 5)
            )
          })
          .toQueryObject()
      ).toEqual({
        text: removeSpaces(`select "Calc".* from "Calc"
          where (
            (
              ("Calc"."x" + "Calc"."y") = $1
            ) or (
              ("Calc"."x" * "Calc"."y") = $2
            )
          ) and (
            ("Calc"."x" / "Calc"."y") = $3
          )`),
        values: [10, 50, 5]
      });
    });
  });

  describe(`insert`, () => {
    test(`insert into "User" ("firstName", "lastName") values ($1, $2)`, () => {
      const User = jsql.table('User', [
        jsql.column('firstName', String),
        jsql.column('lastName', String)
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
        jsql.column('testColumn', String)
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
        jsql.column('testColumn', String, false, true)
      ]);
      expect(() => {
        jsql.insert(TestTable, {}).toJSQL();
      }).toThrowError(JSQLError);
    });
  });
});
