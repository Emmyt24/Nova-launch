type LabelValues = Record<string, string | number | boolean | undefined>;

class NoopMetric {
  inc(_labels?: LabelValues, _value?: number): void {}
  observe(_labelsOrValue?: LabelValues | number, _value?: number): void {}
  set(_labelsOrValue?: LabelValues | number, _value?: number): void {}
}

class NoopRegistry {
  setDefaultLabels(_labels: LabelValues): void {}
  async metrics(): Promise<string> {
    return "";
  }
}

const noopMetric = new NoopMetric();

export const register = new NoopRegistry();
export const metricsRegistry = register;

export const httpRequestDuration = noopMetric;
export const httpRequestTotal = noopMetric;
export const httpRequestSize = noopMetric;
export const httpResponseSize = noopMetric;

export const contractInteractionDuration = noopMetric;
export const contractInteractionTotal = noopMetric;
export const contractGasUsed = noopMetric;
export const tokenDeploymentTotal = noopMetric;
export const tokenDeploymentDuration = noopMetric;
export const tokenDeploymentFees = noopMetric;

export const rpcCallDuration = noopMetric;
export const rpcCallTotal = noopMetric;
export const rpcErrorTotal = noopMetric;

export const dbQueryDuration = noopMetric;
export const dbQueryTotal = noopMetric;
export const dbConnectionsActive = noopMetric;
export const dbConnectionsIdle = noopMetric;

export const walletInteractionTotal = noopMetric;
export const walletConnectionDuration = noopMetric;
export const walletSigningDuration = noopMetric;

export const ipfsOperationDuration = noopMetric;
export const ipfsOperationTotal = noopMetric;
export const ipfsFileSize = noopMetric;

export const activeUsers = noopMetric;
export const revenueTotal = noopMetric;
export const userConversionFunnel = noopMetric;
export const featureUsage = noopMetric;

export const errorTotal = noopMetric;
export const errorRate = noopMetric;

export const walletSubmissionTotal = noopMetric;
export const txConfirmationDuration = noopMetric;
export const eventIngestionLag = noopMetric;
export const eventsProcessedTotal = noopMetric;
export const webhookDeliveryTotal = noopMetric;
export const webhookRetryTotal = noopMetric;
export const webhookDeliveryDuration = noopMetric;

export const jobExecutionDuration = noopMetric;
export const jobExecutionTotal = noopMetric;
export const jobQueueSize = noopMetric;

export const healthCheckStatus = noopMetric;
export const healthCheckDuration = noopMetric;

export class IntegrationMetrics {
  static recordWalletSubmission(): void {}

  static recordTxConfirmation(): void {}

  static recordIngestionLag(): void {}

  static recordEventProcessed(): void {}

  static recordWebhookDelivery(): void {}
}

export class MetricsCollector {
  static recordHttpRequest(): void {}

  static recordContractInteraction(): void {}

  static recordTokenDeployment(): void {}

  static recordRPCCall(): void {}

  static recordDatabaseQuery(): void {}

  static recordWalletInteraction(): void {}

  static recordIPFSOperation(): void {}

  static recordBusinessMetric(): void {}

  static recordError(): void {}

  static recordBackgroundJob(): void {}

  static recordHealthCheck(): void {}

  static updateDatabaseConnections(): void {}

  static updateJobQueueSize(): void {}

  static updateErrorRate(): void {}
}

export function createMetricsMiddleware() {
  return (_req: any, _res: any, next: any) => {
    next();
  };
}
