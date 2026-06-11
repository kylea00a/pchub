import type { Request, Response, NextFunction } from "express";
import { verifyToken, type AuthUser } from "./auth.js";

export type AuthedRequest = Request & { user: AuthUser };

function bearerToken(req: Request) {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  (req as AuthedRequest).user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    const user = (req as AuthedRequest).user;
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin access only" });
      return;
    }
    next();
  });
}
