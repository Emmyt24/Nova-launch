import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import {
  WalletAuthDto,
  RefreshTokenDto,
  AuthResponseDto,
  NonceResponseDto,
} from "./dto/auth.dto";
import { Public, CurrentUser, Protected } from "./decorators/auth.decorators";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { JwtPayloadDto } from "./dto/auth.dto";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get("nonce")
  @ApiOperation({ summary: "Request a nonce to sign with your Stellar wallet" })
  @ApiQuery({ name: "publicKey", description: "Stellar public key (G...)" })
  @ApiResponse({ status: 200, type: NonceResponseDto })
  getNonce(@Query("publicKey") publicKey: string): NonceResponseDto {
    return this.authService.requestNonce(publicKey);
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Authenticate with Stellar wallet signature" })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: "Invalid signature or nonce" })
  async login(@Body() dto: WalletAuthDto): Promise<AuthResponseDto> {
    return this.authService.authenticateWithWallet(dto);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Refresh access token" })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  refresh(@Body() dto: RefreshTokenDto): AuthResponseDto {
    return this.authService.refreshTokens(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Revoke current token" })
  logout(@CurrentUser() user: JwtPayloadDto): void {
    if (user.jti) {
      this.authService.logout(user.jti);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current authenticated user info" })
  me(@CurrentUser() user: JwtPayloadDto): JwtPayloadDto {
    return user;
  }
}
