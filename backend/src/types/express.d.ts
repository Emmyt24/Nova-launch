import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        address: string;
        role: string;
      };
    }
  }
}
