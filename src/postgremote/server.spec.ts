import { Pool } from 'pg';
import express, { Application } from 'express';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { setup, teardown } from './server';
import { jsql, escapeId } from './jsql';

const connectionParams = {
  user: process.env.POSTGRES_USER,
  host: 'localhost',
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD
};

describe('postgremote server', () => {
  let pool: Pool;
  let app: Application;

  beforeAll(() => {
    pool = new Pool(connectionParams);
  });

  afterAll(async () => {
    await pool.end();
  });

  const defaultRole = 'anonymous';
  const secret = 'this is a secret';
  const tokenType = 'jwtToken';
  const tokenExpiresIn = 4 * 7 * 24 * 60 * 60e3;
  const endpoint = '/';

  const setupTestEnvironment = async () => {
    const client = await pool.connect();
    try {
      await client.query(`revoke select
        on all tables in schema pg_catalog
        from public`);
      await client.query(`create type ${escapeId(tokenType)} as ( sub text )`);
      await client.query(`create role ${escapeId(defaultRole)}`);
    } finally {
      client.release();
    }
  };

  const cleanupTestEnvironment = async () => {
    const client = await pool.connect();
    try {
      await client.query(`grant select
        on all tables in schema pg_catalog
        to public`);
      await client.query(`drop role ${escapeId(defaultRole)}`);
      await client.query(`drop type ${escapeId(tokenType)}`);
    } finally {
      client.release();
    }
  };

  describe('making a query using an API end point', async () => {
    beforeAll(async () => {
      await setupTestEnvironment();

      app = express();
      app.use(cookieParser());
      app.use(bodyParser.json());

      app.post(
        endpoint,
        await setup({
          defaultRole,
          secret,
          tokenType,
          tokenExpiresIn
        })
      );
    });

    afterAll(async () => {
      try {
        await cleanupTestEnvironment();
      } finally {
        await teardown();
      }
    });

    it('should make a query and return result as JSON', async () => {
      const client = await pool.connect();

      const TestTable = jsql.table('TestTable', [
        jsql.column('name', { type: String })
      ]);

      try {
        await client.query(
          `create table ${escapeId(TestTable.$$)} (name text)`
        );
        await client.query(
          `grant select on ${escapeId(TestTable.$$)} to ${escapeId(
            defaultRole
          )}`
        );

        await client.query(
          jsql.insert(TestTable, { name: `hey what's up` }).toQueryObject()
        );

        const { body, error } = await request(app)
          .post(endpoint)
          .send(jsql.select([TestTable['*']], { from: TestTable }).toJSQL());

        expect(error).toBeFalsy();
        expect(body).toEqual([{ name: `hey what's up` }]);
      } finally {
        await client.query(`drop table if exists ${escapeId(TestTable.$$)}`);
        client.release();
      }
    });

    it(`should use default role
        when there is no valid token provided`, async () => {
      const client = await pool.connect();

      const TestTable = jsql.table('TestTable', [
        jsql.column('name', { type: String })
      ]);

      try {
        await client.query(
          `create table ${escapeId(TestTable.$$)} (name text)`
        );
        await client.query(
          `revoke select on ${escapeId(TestTable.$$)} from ${escapeId(
            defaultRole
          )}`
        );

        await client.query(
          jsql.insert(TestTable, { name: `hey what's up` }).toQueryObject()
        );

        const { error } = await request(app)
          .post(endpoint)
          .send(jsql.select([TestTable['*']], { from: TestTable }).toJSQL())
          .expect(403);

        expect(error.text).toMatch('permission denied');
      } finally {
        await client.query(`drop table if exists ${escapeId(TestTable.$$)}`);
        client.release();
      }
    });

    it('should use middleware to verify jwt gathered from cookies', async () => {
      const client = await pool.connect();

      // we'll need two roles with different permissions and one table to whcih
      // these permissions should apply in order to make this test

      // just a simple table with default name
      const TestTable = jsql.table('TestTable', [
        jsql.column('name', { type: String })
      ]);

      // and a few of the roles
      const TestRoleOne = 'TestRoleOne';
      const TestRoleTwo = 'TestRoleTwo';

      try {
        // we create all of the required entities
        await client.query(`create role ${escapeId(TestRoleOne)}`);
        await client.query(`create role ${escapeId(TestRoleTwo)}`);
        await client.query(
          `create table ${escapeId(TestTable.$$)} (name text)`
        );

        // and insert an entry into the test table
        await client.query(
          jsql.insert(TestTable, { name: 'Just for a test' }).toQueryObject()
        );

        // now we grant select permission to the TestRoleOne
        await client.query(`grant select
          on ${escapeId(TestTable.$$)}
          to ${escapeId(TestRoleOne)}`);
        // and deny select to the TestRoleTwo
        await client.query(`revoke select
          on ${escapeId(TestTable.$$)}
          from ${escapeId(TestRoleTwo)}`);

        // now we're ready to perform a query to check if our server has
        // an authoriztion middleware

        // first of all let's sign a jwt token with a first role
        const testTokenOne = jwt.sign({ sub: TestRoleOne }, secret);

        // when we make a request with jwt signed for the first role
        // we should have no any error
        const { body } = await request(app)
          .post(endpoint)
          .set('Cookie', `jwt=${testTokenOne}`)
          .send(jsql.select([TestTable['*']], { from: TestTable }).toJSQL())
          .expect(200);
        // and it should actually return a list of rows as it usually does
        expect(body).toEqual([{ name: `Just for a test` }]);

        // now let's try the test role two
        const testTokenTwo = jwt.sign({ sub: TestRoleTwo }, secret);

        // and here we get an error
        await request(app)
          .post(endpoint)
          .set('Cookie', `jwt=${testTokenTwo}`)
          .send(jsql.select([TestTable['*']], { from: TestTable }).toJSQL())
          .expect(403);
      } finally {
        // cleaning everything up
        await client.query(`drop table if exists ${escapeId(TestTable.$$)}`);
        await client.query(`drop role if exists ${escapeId(TestRoleTwo)}`);
        await client.query(`drop role if exists ${escapeId(TestRoleOne)}`);
        client.release();
      }
    });

    it(`should set up cookie with jwt`, async () => {
      const client = await pool.connect();

      try {
        await client.query(`
          create or replace function login() returns ${escapeId(
            tokenType
          )} as $$
          declare
            result ${escapeId(tokenType)};
          begin
            select 'roleName' as sub into result;
            return result;
          end;
          $$ language plpgsql;
        `);

        // postgremote should generate jsql function that returns boolean instead
        // of token type, because postgremote should not allow to work directly
        // with token, it is going to be set up using http only cookies
        // so the only value except errors can be just true
        const login = jsql.function('login', [], Boolean);

        const response = await request(app)
          .post(endpoint)
          .send(login({}).toJSQL())
          .expect(200);

        expect(response.header['set-cookie'][0]).toEqual(
          expect.stringContaining(
            `jwt=${jwt.sign({ sub: 'roleName' }, secret)}`
          )
        );
        expect(response.header['set-cookie'][0]).toEqual(
          expect.stringContaining(`Max-Age=${tokenExpiresIn / 1e3}`)
        );
        expect(response.header['set-cookie'][0]).toEqual(
          expect.stringContaining(`HttpOnly`)
        );
        expect(response.body).toBe(true);
      } finally {
        await client.query(`drop function if exists login()`);
        client.release();
      }
    });

    it(`should deny to use internal pg data`, async () => {
      const PgStatsActivity = jsql.table('pg_stat_activity', [
        jsql.column('username', { type: String })
      ]);

      const { error } = await request(app)
        .post(endpoint)
        .send(
          jsql
            .select([PgStatsActivity['*']], { from: PgStatsActivity })
            .toJSQL()
        )
        .expect(403);
      expect(error.text).toMatch('permission denied');
    });
  });

  describe('different schema', () => {
    const schema = 'someSchemaToUse';
    beforeAll(async () => {
      await setupTestEnvironment();

      app = express();
      app.use(cookieParser());
      app.use(bodyParser.json());

      app.post(
        endpoint,
        await setup({
          schema,
          defaultRole,
          secret,
          tokenType,
          tokenExpiresIn
        })
      );
    });

    afterAll(async () => {
      await cleanupTestEnvironment();

      await teardown();
    });

    it('should work with different schemas', async () => {
      const client = await pool.connect();

      const TestTable = jsql.table(`TestTable`, [
        jsql.column('name', { type: String })
      ]);

      const tableName = escapeId([schema, TestTable.$$].join('.'));

      try {
        await client.query(`create schema ${escapeId(schema)}`);
        await client.query(`create table ${tableName} (name text)`);
        await client.query(`grant usage
          on schema ${escapeId(schema)} to ${escapeId(defaultRole)}`);
        await client.query(`grant all privileges
          on ${tableName} to ${escapeId(defaultRole)}`);

        await request(app)
          .post(endpoint)
          .send(jsql.insert(TestTable, { name: 'Just for a test' }).toJSQL())
          .expect(200);

        await request(app)
          .post(endpoint)
          .send(jsql.select([TestTable['*']], { from: TestTable }).toJSQL())
          .expect(200);
      } finally {
        await client.query(`drop table ${tableName}`);
        await client.query(`drop schema ${escapeId(schema)}`);
        client.release();
      }
    });
  });

  describe('error handling', async () => {
    beforeAll(async () => {
      await setupTestEnvironment();

      app = express();
      app.use(cookieParser());
      app.use(bodyParser.json());

      app.post(
        endpoint,
        await setup({
          defaultRole,
          secret,
          tokenType,
          tokenExpiresIn
        })
      );
    });

    afterAll(async () => {
      try {
        await cleanupTestEnvironment();
      } finally {
        await teardown();
      }
    });

    it(`should respond with 500 if not 403`, async () => {
      const NonexistentTable = jsql.table('NonexistentTable', [
        jsql.column('whatever', { type: String })
      ]);

      const { body } = await request(app)
        .post(endpoint)
        .send(jsql.insert(NonexistentTable, { whatever: 'jeez' }).toJSQL())
        .expect(500);
      expect(body.code).toMatchInlineSnapshot(`"42P01"`);
      expect(body.message).toMatchInlineSnapshot(
        `"relation \\"NonexistentTable\\" does not exist"`
      );
    });
  });

  test(`no args`, async () => {
    try {
      // @ts-ignore
      await setup();
    } catch (error) {
      expect(error.message).toMatchInlineSnapshot(
        `"Settings cannot be undefined"`
      );
    } finally {
      await teardown();
    }
  });

  test(`role is undefined`, async () => {
    try {
      // @ts-ignore
      await setup({
        secret: 'secret'
      });
    } catch (error) {
      expect(error.message).toMatchInlineSnapshot(
        `"Default role cannot be undefined"`
      );
    } finally {
      await teardown();
    }
  });

  test(`wrong defaultRole`, async () => {
    try {
      // @ts-ignore
      await setup({
        secret: 'secret',
        tokenType: 'tokenType',
        defaultRole: 'there is no such a role of course'
      });
    } catch (error) {
      expect(error.message).toMatchInlineSnapshot(
        `"Role 'there is no such a role of course' does not exist"`
      );
    } finally {
      await teardown();
    }
  });

  test(`no secret`, async () => {
    try {
      // @ts-ignore
      await setup({ secret: '' });
    } catch (error) {
      expect(error.message).toMatchInlineSnapshot(
        `"Secret cannot be undefined"`
      );
    } finally {
      await teardown();
    }
  });

  test(`no token type`, async () => {
    try {
      await setup({
        secret: 'oops',
        // @ts-ignore
        defaultRole: process.env.POSTGRES_USER,
        tokenType: ''
      });
    } catch (error) {
      expect(error.message).toMatchInlineSnapshot(
        `"Token type cannot be undefined"`
      );
    } finally {
      await teardown();
    }
  });

  test(`wrong token type`, async () => {
    try {
      await setup({
        secret: 'oops',
        // @ts-ignore
        defaultRole: process.env.POSTGRES_USER,
        tokenType: 'there is no such a token type'
      });
    } catch (error) {
      expect(error.message).toMatchInlineSnapshot(
        `"Token type 'there is no such a token type' does not exist"`
      );
    } finally {
      await teardown();
    }
  });
});
