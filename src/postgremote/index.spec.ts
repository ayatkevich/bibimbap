import { Pool } from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from './index';
import { jsql, escapeId } from './jsql';

const connectionParams = {
  user: 'postgremote',
  host: 'localhost',
  database: 'postgremote',
  password: ''
};

describe('making a query using an API end point', async () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool(connectionParams);
    app.set('pool', pool);
  });

  afterAll(() => {
    pool.end();
  });

  it('should make a query and return result as JSON', async () => {
    const client = await pool.connect();

    const TestTable = jsql.table('TestTable', [
      jsql.column('name', { type: String })
    ]);

    try {
      await client.query(`create table ${escapeId(TestTable.$$)} (name text)`);

      await client.query(
        jsql.insert(TestTable, { name: `hey what's up` }).toQueryObject()
      );

      const { body, error } = await request(app)
        .post('/')
        .send(
          jsql
            .select(TestTable['*'])
            .from(TestTable)
            .toJSQL()
        );

      expect(error).toBeFalsy();
      expect(body).toEqual([{ name: `hey what's up` }]);
    } finally {
      await client.query(`drop table if exists ${escapeId(TestTable.$$)}`);
      client.release();
    }
  });

  it('should use middleware to verify jwt gathered from cookies', async () => {
    const secret = 'this is a secret';
    app.set('secret', secret);

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
      await client.query(`create table ${escapeId(TestTable.$$)} (name text)`);

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
        .post('/')
        .set('Cookie', `jwt=${testTokenOne}`)
        .send(
          jsql
            .select(TestTable['*'])
            .from(TestTable)
            .toJSQL()
        )
        .expect(200);
      // and it should actually return a list of rows as it usually does
      expect(body).toEqual([{ name: `Just for a test` }]);

      // now let's try the test role two
      const testTokenTwo = jwt.sign({ sub: TestRoleTwo }, secret);

      // and here we get an error
      await request(app)
        .post('/')
        .set('Cookie', `jwt=${testTokenTwo}`)
        .send(
          jsql
            .select(TestTable['*'])
            .from(TestTable)
            .toJSQL()
        )
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
    const secret = 'this is a secret';
    app.set('secret', secret);

    const tokenType = 'jwtToken';
    app.set('tokenType', tokenType);

    const client = await pool.connect();

    try {
      await client.query(`create type ${escapeId(tokenType)} as ( sub text )`);
      await client.query(`
        create or replace function login() returns ${escapeId(tokenType)} as $$
        declare
          result ${escapeId(tokenType)};
        begin
          select 'roleName' as sub into result;
          return result;
        end;
        $$ language plpgsql;
      `);

      const login = jsql.function('login', [], Boolean);

      const token = jwt.sign({ sub: 'roleName' }, secret);
      const { body } = await request(app)
        .post('/')
        .send(login().toJSQL())
        .expect(200)
        .expect(
          'Set-Cookie',
          `jwt=${token}; Secure; HttpOnly; Max-Age=${604800}; SameSite=Strict`
        );
      expect(body).toBe(true);
    } finally {
      await client.query(`drop function if exists login()`);
      await client.query(`drop type if exists ${escapeId(tokenType)}`);
      client.release();
    }
  });
});
