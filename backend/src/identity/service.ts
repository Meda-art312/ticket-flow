import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { Db, Tx } from "../infra/db";
import { assert, hash, token, audit } from "../infra/common";
import { config } from "../infra/config";
export class Identity {
  constructor(private db: Db) {}
  async register(input: {
    email: string;
    password: string;
    display_name: string;
  }) {
    const password_hash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: config.ARGON_MEMORY,
      timeCost: config.ARGON_TIME,
    });
    return this.db.transaction(async (tx) => {
      const user = await this.db.one(
        "INSERT INTO users(email,display_name,password_hash) VALUES($1,$2,$3) RETURNING id,email,display_name",
        [input.email.toLowerCase(), input.display_name, password_hash],
        tx,
      );
      await tx.query("INSERT INTO user_roles VALUES($1,'customer')", [user.id]);
      return { ...user, roles: ["customer"] };
    });
  }
  async me(id: string) {
    const user = await this.db.one(
      "SELECT id,email,display_name FROM users WHERE id=$1",
      [id],
    );
    assert(user, 401, "UNAUTHENTICATED");
    const roles = await this.db.rows(
      "SELECT role FROM user_roles WHERE user_id=$1 ORDER BY role",
      [id],
    );
    return { ...user, roles: roles.map((r) => r.role) };
  }
  async authenticate(bearer: string | undefined) {
    assert(bearer && bearer.startsWith("Bearer "), 401, "UNAUTHENTICATED");
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(bearer.slice(7), config.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: "ticketflow",
        audience: "ticketflow-api-v1",
      }) as jwt.JwtPayload;
    } catch {
      assert(false, 401, "UNAUTHENTICATED");
    }
    assert(typeof payload.sub === "string", 401, "UNAUTHENTICATED");
    return this.me(payload.sub);
  }
  async patch(id: string, name: string) {
    await this.db.rows("UPDATE users SET display_name=$2 WHERE id=$1", [
      id,
      name,
    ]);
    return this.me(id);
  }
  private async session(tx: Tx, user: string, family = randomUUID()) {
    const refresh = token();
    await tx.query(
      "INSERT INTO refresh_sessions(user_id,token_hash,family,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '7 days')",
      [user, hash(refresh), family],
    );
    return {
      access_token: jwt.sign({}, config.JWT_SECRET, {
        subject: user,
        issuer: "ticketflow",
        audience: "ticketflow-api-v1",
        expiresIn: 900,
      }),
      expires_in: 900,
      refresh,
    };
  }
  async login(email: string, password: string) {
    const user = await this.db.one("SELECT * FROM users WHERE email=$1", [
      email.toLowerCase(),
    ]);
    assert(
      user && (await argon2.verify(user.password_hash, password)),
      401,
      "INVALID_CREDENTIALS",
    );
    return this.db.transaction((tx) => this.session(tx, user.id));
  }
  async refresh(value: string | undefined) {
    assert(value, 401, "INVALID_REFRESH");
    const digest = hash(value);
    const result = await this.db.transaction(async (tx) => {
      const found = await this.db.one(
        "SELECT family FROM refresh_sessions WHERE token_hash=$1",
        [digest],
        tx,
      );
      if (!found) return null;
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        "refresh/" + found.family,
      ]);
      const old = await this.db.one(
        "SELECT *,expires_at>clock_timestamp() AS active FROM refresh_sessions WHERE token_hash=$1 FOR UPDATE",
        [digest],
        tx,
      );
      if (old.rotated_at || old.revoked_at) {
        await tx.query(
          "UPDATE refresh_sessions SET revoked_at=clock_timestamp() WHERE family=$1",
          [old.family],
        );
        return null;
      }
      if (!old.active) return null;
      await tx.query(
        "UPDATE refresh_sessions SET rotated_at=clock_timestamp() WHERE id=$1",
        [old.id],
      );
      return this.session(tx, old.user_id, old.family);
    });
    assert(result, 401, "REFRESH_REUSE_OR_EXPIRED");
    return result;
  }
  async logout(value: string | undefined) {
    if (value)
      await this.db.transaction(async (tx) => {
        const row = await this.db.one(
          "SELECT family FROM refresh_sessions WHERE token_hash=$1",
          [hash(value)],
          tx,
        );
        if (!row) return;
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          "refresh/" + row.family,
        ]);
        await tx.query(
          "UPDATE refresh_sessions SET revoked_at=clock_timestamp() WHERE family=$1",
          [row.family],
        );
      });
    return { logged_out: true };
  }
  async organizerRole(actor: string, id: string, enabled: boolean) {
    return this.db.transaction(async (tx) => {
      if (enabled)
        await tx.query(
          "INSERT INTO user_roles VALUES($1,'organizer') ON CONFLICT DO NOTHING",
          [id],
        );
      else
        await tx.query(
          "DELETE FROM user_roles WHERE user_id=$1 AND role='organizer'",
          [id],
        );
      await audit(
        this.db,
        tx,
        actor,
        enabled ? "GrantOrganizer" : "RevokeOrganizer",
        id,
      );
      return { user_id: id, organizer: enabled };
    });
  }
}
