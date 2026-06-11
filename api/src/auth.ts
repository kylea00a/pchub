import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, type RenterProfileRow } from "./db.js";
import { nanoid } from "nanoid";

const JWT_SECRET = process.env.JWT_SECRET ?? "skypc-dev-secret-change-in-production";
const JWT_EXPIRES = "30d";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
};

export type JwtPayload = AuthUser;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function getUserByEmail(email: string) {
  return db
    .prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)")
    .get(email.trim()) as
    | {
        id: string;
        email: string;
        password_hash: string;
        name: string;
        role: string;
      }
    | undefined;
}

export function getUserById(id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | {
        id: string;
        email: string;
        name: string;
        role: string;
      }
    | undefined;
}

export function toAuthUser(row: { id: string; email: string; name: string; role: string }): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as "user" | "admin",
  };
}

export function getOrCreateRenterProfile(userId: string, displayName: string) {
  const existing = db
    .prepare("SELECT * FROM renter_profiles WHERE user_id = ?")
    .get(userId) as RenterProfileRow | undefined;
  if (existing) return existing;

  const id = nanoid(12);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO renter_profiles (
      id, user_id, display_name, storage_plan, storage_quota_bytes, storage_used_bytes, created_at
    ) VALUES (?, ?, ?, 'none', 0, 0, ?)`
  ).run(id, userId, displayName, now);

  return db.prepare("SELECT * FROM renter_profiles WHERE id = ?").get(id) as RenterProfileRow;
}

export function getRenterProfileByUserId(userId: string) {
  return db
    .prepare("SELECT * FROM renter_profiles WHERE user_id = ?")
    .get(userId) as RenterProfileRow | undefined;
}

export function ensureDefaultAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@skypc.ph").toLowerCase();
  const exists = getUserByEmail(email);
  if (exists) return;

  const password = process.env.ADMIN_PASSWORD ?? "admin123";
  const hash = bcrypt.hashSync(password, 10);
  const id = nanoid(12);
  try {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, created_at)
       VALUES (?, ?, ?, 'Platform Admin', 'admin', ?)`
    ).run(id, email, hash, new Date().toISOString());
    console.log(`Default admin created: ${email} (change password in production)`);
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : null;
    if (code !== "SQLITE_CONSTRAINT_UNIQUE") throw err;
  }
}
