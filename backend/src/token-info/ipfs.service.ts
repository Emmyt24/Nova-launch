import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { TokenMetadata } from "./interfaces/token.interface";

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);
  private readonly ipfsGateway: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService
  ) {
    this.ipfsGateway =
      this.configService.get<string>("IPFS_GATEWAY_URL") ||
      "https://ipfs.io/ipfs";
    this.timeoutMs = this.configService.get<number>("IPFS_TIMEOUT_MS") || 5000;
  }

  async fetchMetadata(ipfsHashOrUrl: string): Promise<TokenMetadata | null> {
    if (!ipfsHashOrUrl) return null;

    const url = this.resolveUrl(ipfsHashOrUrl);
    if (!url) return null;

    try {
      const response = await firstValueFrom(
        this.httpService.get<TokenMetadata>(url, {
          timeout: this.timeoutMs,
        })
      );
      return this.sanitizeMetadata(response.data);
    } catch (error) {
      this.logger.warn(`Failed to fetch metadata from ${url}`, error?.message);
      return null;
    }
  }

  resolveUrl(ipfsHashOrUrl: string): string | null {
    if (!ipfsHashOrUrl) return null;

    // Already a full HTTP URL
    if (
      ipfsHashOrUrl.startsWith("http://") ||
      ipfsHashOrUrl.startsWith("https://")
    ) {
      return ipfsHashOrUrl;
    }

    // ipfs:// protocol
    if (ipfsHashOrUrl.startsWith("ipfs://")) {
      const hash = ipfsHashOrUrl.replace("ipfs://", "");
      return `${this.ipfsGateway}/${hash}`;
    }

    // Raw IPFS hash (Qm... or bafy...)
    if (ipfsHashOrUrl.startsWith("Qm") || ipfsHashOrUrl.startsWith("bafy")) {
      return `${this.ipfsGateway}/${ipfsHashOrUrl}`;
    }

    return null;
  }

  private sanitizeMetadata(raw: unknown): TokenMetadata {
    if (!raw || typeof raw !== "object") return {};
    const r = raw as Record<string, unknown>;
    return {
      image: typeof r.image === "string" ? r.image : undefined,
      description:
        typeof r.description === "string" ? r.description : undefined,
      externalUrl:
        typeof r.external_url === "string" ? r.external_url : undefined,
      attributes: Array.isArray(r.attributes)
        ? (r.attributes as Record<string, unknown>[])
        : undefined,
    };
  }
}
