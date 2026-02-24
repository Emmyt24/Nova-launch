import { IsEnum, IsOptional, IsArray } from "class-validator";
import { Transform } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export enum TokenInclude {
  METADATA = "metadata",
  BURNS = "burns",
  ANALYTICS = "analytics",
}

export class GetTokenQueryDto {
  @ApiPropertyOptional({
    description: "Additional data to include in response",
    enum: TokenInclude,
    isArray: true,
    example: ["metadata", "burns", "analytics"],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(TokenInclude, { each: true })
  @Transform(({ value }) => {
    if (typeof value === "string") return [value];
    return value;
  })
  include?: TokenInclude[];
}
