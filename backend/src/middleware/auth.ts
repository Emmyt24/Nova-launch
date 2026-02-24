import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Database } from "../config/database";
import { User } from "../types";

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "admin-secret-key";

export interface AuthRequest extends Request {
  admin?: User;
}

export const authenticateAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as { userId: string };
    const user = await Database.findUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    if (user.banned) {
      return res.status(403).json({ error: "Account banned" });
    }

    if (user.role === "user") {
      return res.status(403).json({ error: "Admin access required" });
    }

    req.admin = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

export const requireRole = (...roles: User["role"][]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required: roles,
        current: req.admin.role,
      });
    }

    next();
  };
};

export const requireSuperAdmin = requireRole("super_admin");
