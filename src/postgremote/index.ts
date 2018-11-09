import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { jsql, Query, escapeId } from './jsql';
import { verify } from 'jsonwebtoken';

const connectionParams = {
  user: process.env.POSTGRES_USER,
  host: 'localhost',
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD
};
let pool: Pool;

export class PostgremoteError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, PostgremoteError.prototype);
  }
}

type PostgremoteSettings = {
  /**
   * if there is no schema public scheme will be used by default
   */
  schema?: string;
  defaultRole: string;
  secret: string;
  tokenType: string;
  tokenExpiresIn: number;
};

async function assertSettingsAndFetchTokenTypeID(
  pool: Pool,
  settings: PostgremoteSettings
) {
  if (!settings) {
    throw new PostgremoteError(`Settings cannot be undefined`);
  }
  if (!settings.secret) {
    throw new PostgremoteError(`Secret cannot be undefined`);
  }
  if (!settings.defaultRole) {
    throw new PostgremoteError(`Default role cannot be undefined`);
  }
  if (!settings.tokenType) {
    throw new PostgremoteError(`Token type cannot be undefined`);
  }

  const client = await pool.connect();
  try {
    const {
      rows: [doesRoleExist]
    } = await client.query(`select true from pg_roles where rolname=$1`, [
      settings.defaultRole
    ]);
    if (!doesRoleExist) {
      throw new PostgremoteError(
        `Role '${settings.defaultRole}' does not exist`
      );
    }

    const {
      rows: [tokenRow]
    } = await client.query(`select oid from pg_type where typname=$1`, [
      settings.tokenType
    ]);
    if (!tokenRow) {
      throw new PostgremoteError(
        `Token type '${settings.tokenType}' does not exist`
      );
    }
    return tokenRow.oid;
  } finally {
    client.release();
  }
}

export async function setup(settings: PostgremoteSettings) {
  pool = new Pool(connectionParams);

  const tokenTypeID = await assertSettingsAndFetchTokenTypeID(pool, settings);

  return async function postgremote(req: Request, res: Response) {
    const client = await pool.connect();
    try {
      let role = settings.defaultRole;
      if (req.cookies.jwt) {
        const { sub } = verify(req.cookies.jwt, settings.secret) as {
          [key: string]: any;
        };
        role = sub;
      }
      await client.query(
        `SET search_path TO ${escapeId(settings.schema || 'public')}`
      );
      await client.query(`SET ROLE ${escapeId(role)}`);

      const response = await client.query(jsql(req.body as Query));
      const tokenField = response.fields.find(
        field => field.dataTypeID === tokenTypeID
      );
      let result: any[] | any = response.rows;
      if (tokenField) {
        const [, sub] = response.rows[0][tokenField.name].match(/^\((.*)\)$/);
        const token = jwt.sign({ sub }, settings.secret);
        res.cookie('jwt', token, {
          secure: true,
          httpOnly: true,
          maxAge: settings.tokenExpiresIn,
          sameSite: 'Strict'
        });
        result = true;
      }
      res.send(result);
    } catch (error) {
      res.status(403);
      res.send(error.message);
    } finally {
      client.release();
    }
  };
}

export async function teardown() {
  await pool.end();
}
