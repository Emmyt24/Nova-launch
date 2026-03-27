import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DECORATORS } from "../../auth.constants";
import { JwtPayloadDto } from "../dto/auth.dto";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      DECORATORS.ROLES,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<{ user: JwtPayloadDto & { roles?: string[] } }>();

    if (!user) {
      throw new ForbiddenException("No user context found");
    }

    const userRoles: string[] = (user as any).roles ?? [];
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `Requires one of roles: [${requiredRoles.join(", ")}]`
      );
    }

    return true;
  }
}
