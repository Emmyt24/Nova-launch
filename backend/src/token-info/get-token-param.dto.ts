import { IsString, Matches, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

// Stellar address: G... (56 chars, base32) or asset code:issuer format
const STELLAR_ADDRESS_REGEX = /^[A-Z0-9]{1,12}:[A-Z0-9]{56}$|^[A-Z2-7]{56}$/;

export class GetTokenParamDto {
  @ApiProperty({
    description:
      "Token address in format ASSET_CODE:ISSUER_ADDRESS or standalone Stellar address",
    example: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  })
  @IsString()
  @Matches(STELLAR_ADDRESS_REGEX, {
    message:
      "Invalid token address format. Use ASSET_CODE:ISSUER or Stellar address (56 chars)",
  })
  address: string;
}
