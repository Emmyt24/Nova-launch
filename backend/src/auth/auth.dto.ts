import { IsString, IsNotEmpty, IsOptional, IsEnum } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class WalletAuthDto {
  @ApiProperty({
    description: "Stellar wallet public key",
    example: "GXXXXXXXX...",
  })
  @IsString()
  @IsNotEmpty()
  publicKey: string;

  @ApiProperty({
    description: "Signed message (base64 encoded signature)",
    example: "abc123...",
  })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({
    description: "The nonce that was signed",
    example: "nonce-uuid-here",
  })
  @IsString()
  @IsNotEmpty()
  nonce: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: "Refresh token" })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ApiKeyAuthDto {
  @ApiProperty({ description: "API key for programmatic access" })
  @IsString()
  @IsNotEmpty()
  apiKey: string;
}

export class AuthResponseDto {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty() expiresIn: number;
  @ApiProperty() tokenType: string;
  @ApiProperty() walletAddress: string;
}

export class NonceResponseDto {
  @ApiProperty() nonce: string;
  @ApiProperty() expiresAt: number;
  @ApiProperty() message: string;
}

export class JwtPayloadDto {
  sub: string; // wallet address
  walletAddress: string;
  type: "access" | "refresh";
  iat?: number;
  exp?: number;
  jti?: string; // JWT ID for revocation
}
