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

export async function startup(settings: {
  /**
   * if there is no schema public scheme will be used by default
   */
  schema?: string;
  defaultRole: string;
  secret: string;
  tokenType: string;
  tokenExpiresIn: number;
}) {
  pool = new Pool(connectionParams);

  const client = await pool.connect();
  let tokenTypeID: number;
  try {
    const {
      rows: [{ oid }]
    } = await client.query(`select oid from pg_type where typname = $1`, [
      settings.tokenType
    ]);
    tokenTypeID = oid;
  } finally {
    client.release();
  }

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

export async function shutdown() {
  await pool.end();
}
