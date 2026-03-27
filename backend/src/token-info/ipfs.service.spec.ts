import { Test, TestingModule } from "@nestjs/testing";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { of, throwError } from "rxjs";
import { AxiosResponse } from "axios";
import { IpfsService } from "../../src/tokens/ipfs.service";

const mockHttpService = { get: jest.fn() };
const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      IPFS_GATEWAY_URL: "https://ipfs.io/ipfs",
      IPFS_TIMEOUT_MS: 5000,
    };
    return config[key];
  }),
};

function makeResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: {} } as any,
  };
}

describe("IpfsService", () => {
  let service: IpfsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IpfsService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
    service = module.get<IpfsService>(IpfsService);
  });

  describe("resolveUrl", () => {
    it("should return http URLs as-is", () => {
      expect(service.resolveUrl("https://example.com/meta.json")).toBe(
        "https://example.com/meta.json"
      );
    });

    it("should convert ipfs:// URLs to gateway URL", () => {
      expect(service.resolveUrl("ipfs://QmHash123")).toBe(
        "https://ipfs.io/ipfs/QmHash123"
      );
    });

    it("should convert raw Qm... hash to gateway URL", () => {
      expect(service.resolveUrl("QmHash456")).toBe(
        "https://ipfs.io/ipfs/QmHash456"
      );
    });

    it("should convert raw bafy... hash to gateway URL", () => {
      expect(
        service.resolveUrl(
          "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
        )
      ).toBe(
        "https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
      );
    });

    it("should return null for empty string", () => {
      expect(service.resolveUrl("")).toBeNull();
    });

    it("should return null for unrecognized format", () => {
      expect(service.resolveUrl("notavalidhash")).toBeNull();
    });
  });

  describe("fetchMetadata", () => {
    it("should fetch and return sanitized metadata", async () => {
      mockHttpService.get.mockReturnValue(
        of(
          makeResponse({
            image: "https://example.com/img.png",
            description: "My token",
            external_url: "https://mytoken.com",
            attributes: [{ trait_type: "rarity", value: "rare" }],
          })
        )
      );

      const result = await service.fetchMetadata(
        "https://example.com/meta.json"
      );
      expect(result?.image).toBe("https://example.com/img.png");
      expect(result?.description).toBe("My token");
      expect(result?.externalUrl).toBe("https://mytoken.com");
      expect(result?.attributes).toHaveLength(1);
    });

    it("should return null for empty input", async () => {
      const result = await service.fetchMetadata("");
      expect(result).toBeNull();
    });

    it("should return null on HTTP error", async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error("Timeout"))
      );
      const result = await service.fetchMetadata("QmHash123");
      expect(result).toBeNull();
    });

    it("should sanitize non-string fields", async () => {
      mockHttpService.get.mockReturnValue(
        of(makeResponse({ image: 123, description: null }))
      );
      const result = await service.fetchMetadata(
        "https://example.com/meta.json"
      );
      expect(result?.image).toBeUndefined();
      expect(result?.description).toBeUndefined();
    });
  });
});
