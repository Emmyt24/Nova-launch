import {
  SetMetadata,
  createParamDecorator,
  ExecutionContext,
  applyDecorators,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { DECORATORS } from "../auth.constants";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { RolesGuard } from "../guards/roles.guard";

// Mark a route as public (skip JWT auth)
export const Public = () => SetMetadata(DECORATORS.IS_PUBLIC, true);

// Assign required roles to a route
export const Roles = (...roles: string[]) =>
  SetMetadata(DECORATORS.ROLES, roles);

// Mark route as requiring API key auth
export const RequireApiKey = () => SetMetadata(DECORATORS.API_KEY, true);

// Custom rate limit override per route
export const RateLimit = (max: number, windowMs?: number) =>
  SetMetadata(DECORATORS.RATE_LIMIT, { max, windowMs });

// Protect a route with JWT + optional roles
export const Protected = (...roles: string[]) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, RolesGuard),
    ...(roles.length ? [Roles(...roles)] : []),
    ApiBearerAuth(),
    ApiUnauthorizedResponse({ description: "Unauthorized" })
  );

// Extract authenticated user from request
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  }
);

// Extract wallet address from authenticated request
export const WalletAddress = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.walletAddress;
  }
);
