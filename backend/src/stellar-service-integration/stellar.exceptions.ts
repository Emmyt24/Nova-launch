import { HttpException, HttpStatus } from "@nestjs/common";
import { StellarErrorCode } from "./stellar.types";

export class StellarException extends HttpException {
  public readonly code: StellarErrorCode;
  public readonly details?: unknown;

  constructor(
    code: StellarErrorCode,
    message: string,
    details?: unknown,
    status: HttpStatus = HttpStatus.BAD_GATEWAY
  ) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
  }
}

export class StellarNetworkException extends StellarException {
  constructor(message: string, details?: unknown) {
    super(StellarErrorCode.NETWORK_ERROR, message, details);
  }
}

export class StellarInvalidAddressException extends StellarException {
  constructor(address: string) {
    super(
      StellarErrorCode.INVALID_ADDRESS,
      `Invalid Stellar address: ${address}`,
      { address },
      HttpStatus.BAD_REQUEST
    );
  }
}

export class StellarContractException extends StellarException {
  constructor(message: string, details?: unknown) {
    super(StellarErrorCode.CONTRACT_ERROR, message, details);
  }
}

export class StellarTransactionFailedException extends StellarException {
  constructor(txHash: string, details?: unknown) {
    super(
      StellarErrorCode.TRANSACTION_FAILED,
      `Transaction failed: ${txHash}`,
      details
    );
  }
}

export class StellarRateLimitException extends StellarException {
  constructor() {
    super(
      StellarErrorCode.RATE_LIMITED,
      "Rate limit exceeded. Please try again later.",
      undefined,
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}

export class StellarTimeoutException extends StellarException {
  constructor(operation: string) {
    super(
      StellarErrorCode.TIMEOUT,
      `Operation timed out: ${operation}`,
      undefined,
      HttpStatus.GATEWAY_TIMEOUT
    );
  }
}

export class StellarNotFoundException extends StellarException {
  constructor(resource: string, identifier: string) {
    super(
      StellarErrorCode.NOT_FOUND,
      `${resource} not found: ${identifier}`,
      { resource, identifier },
      HttpStatus.NOT_FOUND
    );
  }
}

export class StellarParseException extends StellarException {
  constructor(message: string, details?: unknown) {
    super(
      StellarErrorCode.PARSE_ERROR,
      `Parse error: ${message}`,
      details,
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }
}
