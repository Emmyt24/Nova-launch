import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import {
  GetTokenQueryDto,
  TokenInclude,
} from "../../src/tokens/dto/get-token-query.dto";
import { GetTokenParamDto } from "../../src/tokens/dto/get-token-param.dto";

describe("GetTokenQueryDto", () => {
  const toDto = (plain: Record<string, unknown>) =>
    plainToInstance(GetTokenQueryDto, plain);

  it("should be valid with no include param", async () => {
    const dto = toDto({});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("should accept valid include values", async () => {
    const dto = toDto({ include: ["metadata", "burns", "analytics"] });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.include).toContain(TokenInclude.METADATA);
  });

  it("should reject unknown include values", async () => {
    const dto = toDto({ include: ["unknown_field"] });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe("include");
  });

  it("should accept single include as string and convert to array", async () => {
    const dto = toDto({ include: "metadata" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(Array.isArray(dto.include)).toBe(true);
  });
});

describe("GetTokenParamDto", () => {
  const toDto = (plain: Record<string, unknown>) =>
    plainToInstance(GetTokenParamDto, plain);

  const validIssuer =
    "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

  it("should accept valid ASSET_CODE:ISSUER format", async () => {
    const dto = toDto({ address: `USDC:${validIssuer}` });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("should accept standalone 56-char Stellar address", async () => {
    const dto = toDto({ address: validIssuer });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("should reject random strings", async () => {
    const dto = toDto({ address: "not-an-address" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should reject empty string", async () => {
    const dto = toDto({ address: "" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should reject ASSET_CODE without issuer", async () => {
    const dto = toDto({ address: "USDC" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("should reject asset codes longer than 12 chars", async () => {
    const dto = toDto({ address: `TOOLONGASSETCODE:${validIssuer}` });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
