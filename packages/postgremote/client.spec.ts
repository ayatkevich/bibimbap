import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { Pool } from 'pg';
import { config, databaseConnectionPool, exec, serverEndpoint } from './client';
import { escapeId, jsql } from './jsql';
import { setup, teardown } from './server';
describe(`postgremote client pool`, () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it(`should provide method to set up pg pool`, () => {
    config(pool);
    expect(databaseConnectionPool).toBe(pool);
  });

  it(`should not make any query if there is neither pool nor endpoint`, async () => {
    // @ts-ignore
    config(undefined);
    const PgRoles = jsql.table('pg_roles', [
      jsql.column('rolname', { type: String })
    ]);

    await expect(
      exec(jsql.select([PgRoles.rolname], { from: [PgRoles] }))
    ).rejects.toMatchInlineSnapshot(
      `[Error: Exec should be provided with either pool or endpoint]`
    );
  });

  it(`should be able to make a simple query`, async () => {
    config(pool);
    const PgRoles = jsql.table('pg_roles', [
      jsql.column('rolname', { type: String })
    ]);

    const result = await exec(
      jsql.select([PgRoles.rolname], { from: [PgRoles] })
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rolname: process.env.PGUSER })
      ])
    );
  });

  describe('postgremote client http', () => {
    let server: Server;
    let port: number;
    const defaultRole = 'clientAnonymous';
    const secret = 'this is a secret';
    const tokenType = 'clientJwtToken';
    const tokenExpiresIn = 4 * 7 * 24 * 60 * 60e3;
    const endpoint = '/';

    const setupTestEnvironment = async () => {
      const client = await pool.connect();
      try {
        try {
          await client.query(
            `create type ${escapeId(tokenType)} as ( sub text )`
          );
        } catch (err) {}
        await client.query(`create role ${escapeId(defaultRole)}`);
        await client.query(`grant select
          on all tables in schema pg_catalog
          to ${escapeId(defaultRole)}`);
      } finally {
        client.release();
      }
    };

    const cleanupTestEnvironment = async () => {
      const client = await pool.connect();
      try {
        await client.query(`revoke select
          on all tables in schema pg_catalog
          from ${escapeId(defaultRole)}`);
        await client.query(`drop role ${escapeId(defaultRole)}`);
        await client.query(`drop type ${escapeId(tokenType)}`);
      } finally {
        client.release();
      }
    };

    beforeAll(async () => {
      await setupTestEnvironment();

      const app = express();
      server = (await new Promise(
        resolve => (server = app.listen(() => resolve(server)))
      )) as Server;
      port = (server.address() as AddressInfo).port;
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
        await new Promise(resolve => server.close(resolve));
      }
    });

    it(`should make http request to the server if there is no pool
        but endpoint is provided`, async () => {
      const path = `http://localhost:${port}${endpoint}`;
      config(path);
      expect(databaseConnectionPool).toBe(undefined);
      expect(serverEndpoint).toBe(path);

      const PgRoles = jsql.table('pg_roles', [
        jsql.column('rolname', { type: String })
      ]);

      const result = await exec(
        jsql.select([PgRoles.rolname], { from: [PgRoles] })
      );

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rolname: process.env.PGUSER })
        ])
      );
    });
  });
});
