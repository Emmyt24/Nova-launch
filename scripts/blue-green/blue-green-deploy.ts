/**
 * Blue-Green Deployment Orchestrator — Nova Launch
 *
 * Implements zero-downtime deployments by maintaining two identical
 * production environments ("blue" and "green"). Traffic is shifted
 * atomically via ALB listener rule weight updates after the new
 * environment passes health checks.
 *
 * Flow:
 *   1. Determine active slot (blue|green) from ALB target group health
 *   2. Deploy new image to the INACTIVE slot's ECS service
 *   3. Wait for the new tasks to become healthy
 *   4. Run smoke tests against the inactive slot directly
 *   5. Shift 100% of ALB traffic to the new slot (atomic swap)
 *   6. Drain and scale-down the old slot
 *   7. On any failure → automatic rollback to the previous slot
 *
 * Usage:
 *   npx ts-node scripts/blue-green/blue-green-deploy.ts \
 *     --env production \
 *     --image 123456789012.dkr.ecr.us-east-1.amazonaws.com/nova-launch/production/backend:v1.2.3 \
 *     --service backend
 */

// ---------------------------------------------------------------------------
// Minimal AWS client interfaces (no SDK import at module level)
// ---------------------------------------------------------------------------

/** Minimal ECS client interface — satisfied by real SDK client and mocks */
export interface IECSClient {
  send(cmd: unknown): Promise<unknown>;
}

/** Minimal ALB client interface */
export interface IALBClient {
  send(cmd: unknown): Promise<unknown>;
}

/** Minimal CloudWatch client interface */
export interface ICWClient {
  send(cmd: unknown): Promise<unknown>;
}

/**
 * Command factories injected into the deployer.
 * In production these wrap the real AWS SDK constructors.
 * In tests they return plain objects whose constructor.name matches.
 */
export interface CommandFactories {
  // ECS
  DescribeServicesCommand(input: unknown): unknown;
  UpdateServiceCommand(input: unknown): unknown;
  DescribeTaskDefinitionCommand(input: unknown): unknown;
  RegisterTaskDefinitionCommand(input: unknown): unknown;
  // ALB
  DescribeTargetHealthCommand(input: unknown): unknown;
  DescribeTargetGroupsCommand(input: unknown): unknown;
  ModifyListenerRuleCommand(input: unknown): unknown;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Slot = "blue" | "green";
export type ServiceName = "backend" | "frontend";

export interface BlueGreenConfig {
  region: string;
  clusterName: string;
  environment: string;
  project: string;
  imageUri: string;
  service: ServiceName;
  healthCheckTimeoutSeconds: number;
  healthCheckIntervalSeconds: number;
  minHealthyPercent: number;
  runSmokeTests: boolean;
  smokeTestPath: string;
  drainWaitSeconds: number;
  dryRun: boolean;
}

export interface DeploymentState {
  activeSlot: Slot;
  inactiveSlot: Slot;
  activeServiceName: string;
  inactiveServiceName: string;
  activeTargetGroupArn: string;
  inactiveTargetGroupArn: string;
  listenerRuleArn: string;
  previousTaskDefinitionArn: string;
  newTaskDefinitionArn: string;
  startedAt: Date;
}

export interface DeploymentResult {
  success: boolean;
  previousSlot: Slot;
  newActiveSlot: Slot;
  newTaskDefinitionArn: string;
  durationSeconds: number;
  rolledBack: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export class Logger {
  private prefix: string;

  constructor(prefix = "blue-green") {
    this.prefix = prefix;
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    const line = meta
      ? `[${this.prefix}] ℹ️  ${msg} ${JSON.stringify(meta)}`
      : `[${this.prefix}] ℹ️  ${msg}`;
    console.log(line);
  }

  success(msg: string): void {
    console.log(`[${this.prefix}] ✅ ${msg}`);
  }

  warn(msg: string): void {
    console.warn(`[${this.prefix}] ⚠️  ${msg}`);
  }

  error(msg: string, err?: unknown): void {
    console.error(`[${this.prefix}] ❌ ${msg}`, err ?? "");
  }

  step(n: number, total: number, msg: string): void {
    console.log(`[${this.prefix}] [${n}/${total}] ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(baseDelayMs * Math.pow(2, attempt - 1));
      }
    }
  }
  throw lastError;
}

/**
 * Builds real AWS SDK command factories.
 * Called only when running against a real AWS account (not in tests).
 */
function buildRealCommandFactories(): CommandFactories {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const ecs = require("@aws-sdk/client-ecs");
  const alb = require("@aws-sdk/client-elastic-load-balancing-v2");
  /* eslint-enable @typescript-eslint/no-var-requires */
  return {
    DescribeServicesCommand: (i: unknown) => new ecs.DescribeServicesCommand(i),
    UpdateServiceCommand: (i: unknown) => new ecs.UpdateServiceCommand(i),
    DescribeTaskDefinitionCommand: (i: unknown) =>
      new ecs.DescribeTaskDefinitionCommand(i),
    RegisterTaskDefinitionCommand: (i: unknown) =>
      new ecs.RegisterTaskDefinitionCommand(i),
    DescribeTargetHealthCommand: (i: unknown) =>
      new alb.DescribeTargetHealthCommand(i),
    DescribeTargetGroupsCommand: (i: unknown) =>
      new alb.DescribeTargetGroupsCommand(i),
    ModifyListenerRuleCommand: (i: unknown) =>
      new alb.ModifyListenerRuleCommand(i),
  };
}

// ---------------------------------------------------------------------------
// BlueGreenDeployer
// ---------------------------------------------------------------------------

export class BlueGreenDeployer {
  private ecs: IECSClient;
  private alb: IALBClient;
  private cmd: CommandFactories;
  private cfg: BlueGreenConfig;
  private log: Logger;

  constructor(
    config: BlueGreenConfig,
    deps?: {
      ecs?: IECSClient;
      alb?: IALBClient;
      cw?: ICWClient;
      commands?: CommandFactories;
      logger?: Logger;
    },
  ) {
    this.cfg = config;
    this.log = deps?.logger ?? new Logger("blue-green");
    this.cmd = deps?.commands ?? buildRealCommandFactories();

    if (deps?.ecs) {
      this.ecs = deps.ecs;
    } else {
      /* eslint-disable @typescript-eslint/no-var-requires */
      const { ECSClient } = require("@aws-sdk/client-ecs");
      this.ecs = new ECSClient({ region: config.region });
    }

    if (deps?.alb) {
      this.alb = deps.alb;
    } else {
      const {
        ElasticLoadBalancingV2Client,
      } = require("@aws-sdk/client-elastic-load-balancing-v2");
      this.alb = new ElasticLoadBalancingV2Client({ region: config.region });
      /* eslint-enable @typescript-eslint/no-var-requires */
    }
  }

  // -------------------------------------------------------------------------
  // Public entry point
  // -------------------------------------------------------------------------

  async deploy(): Promise<DeploymentResult> {
    const startedAt = new Date();
    const TOTAL = 7;
    let state: DeploymentState | null = null;

    try {
      this.log.step(1, TOTAL, "Discovering active/inactive slots…");
      state = await this.discoverSlots();
      this.log.info("Slot topology", {
        active: state.activeSlot,
        inactive: state.inactiveSlot,
      });

      if (this.cfg.dryRun) {
        this.log.warn("DRY RUN — no changes will be made");
        return this.buildResult(state, startedAt, false, false);
      }

      this.log.step(2, TOTAL, "Registering new task definition…");
      state.newTaskDefinitionArn = await this.registerNewTaskDefinition(
        state.inactiveServiceName,
        state.previousTaskDefinitionArn,
      );

      this.log.step(3, TOTAL, "Deploying to inactive slot…");
      await this.deployToInactiveSlot(state);

      this.log.step(4, TOTAL, "Waiting for health checks to pass…");
      await this.waitForHealthy(state.inactiveTargetGroupArn);

      if (this.cfg.runSmokeTests) {
        this.log.step(5, TOTAL, "Running smoke tests on inactive slot…");
        await this.runSmokeTests(state.inactiveTargetGroupArn);
      } else {
        this.log.step(5, TOTAL, "Smoke tests skipped");
      }

      this.log.step(6, TOTAL, "Shifting traffic to new slot…");
      await this.shiftTraffic(state);
      this.log.success(`Traffic shifted to ${state.inactiveSlot} slot`);

      this.log.step(7, TOTAL, "Draining old slot…");
      await this.drainOldSlot(state);

      this.log.success(`Deployment complete. Active: ${state.inactiveSlot}`);
      return this.buildResult(state, startedAt, true, false);
    } catch (err) {
      this.log.error("Deployment failed — initiating rollback", err);
      if (state) {
        try {
          await this.rollback(state);
          this.log.success("Rollback completed");
        } catch (rbErr) {
          this.log.error("Rollback also failed!", rbErr);
        }
      }
      return this.buildResult(
        state,
        startedAt,
        false,
        true,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Discover slots
  // -------------------------------------------------------------------------

  async discoverSlots(): Promise<DeploymentState> {
    const { project, environment, service, clusterName } = this.cfg;
    const blueServiceName = `${project}-${environment}-${service}-blue`;
    const greenServiceName = `${project}-${environment}-${service}-green`;

    const resp = (await withRetry(() =>
      this.ecs.send(
        this.cmd.DescribeServicesCommand({
          cluster: clusterName,
          services: [blueServiceName, greenServiceName],
        }),
      ),
    )) as any;

    const services: any[] = resp.services ?? [];
    if (services.length < 2) {
      throw new Error(
        `Expected 2 ECS services (blue + green) for ${service}, found ${services.length}.`,
      );
    }

    const blueService = services.find((s: any) =>
      s.serviceName?.includes("-blue"),
    );
    const greenService = services.find((s: any) =>
      s.serviceName?.includes("-green"),
    );
    if (!blueService || !greenService) {
      throw new Error("Could not identify blue and green services");
    }

    const blueTgArn = blueService.loadBalancers?.[0]?.targetGroupArn ?? "";
    const greenTgArn = greenService.loadBalancers?.[0]?.targetGroupArn ?? "";
    if (!blueTgArn || !greenTgArn) {
      throw new Error(
        "Could not determine target group ARNs from ECS service config",
      );
    }

    const activeSlot = await this.determineActiveSlot(blueTgArn, greenTgArn);
    const inactiveSlot: Slot = activeSlot === "blue" ? "green" : "blue";

    const listenerRuleArn = await this.getListenerRuleArn(blueTgArn);
    const inactiveService =
      inactiveSlot === "blue" ? blueService : greenService;

    return {
      activeSlot,
      inactiveSlot,
      activeServiceName:
        activeSlot === "blue" ? blueServiceName : greenServiceName,
      inactiveServiceName:
        inactiveSlot === "blue" ? blueServiceName : greenServiceName,
      activeTargetGroupArn: activeSlot === "blue" ? blueTgArn : greenTgArn,
      inactiveTargetGroupArn: inactiveSlot === "blue" ? blueTgArn : greenTgArn,
      listenerRuleArn,
      previousTaskDefinitionArn: inactiveService.taskDefinition ?? "",
      newTaskDefinitionArn: "",
      startedAt: new Date(),
    };
  }

  private async determineActiveSlot(
    blueTgArn: string,
    greenTgArn: string,
  ): Promise<Slot> {
    const [blueCount, greenCount] = await Promise.all([
      this.getHealthyTargetCount(blueTgArn),
      this.getHealthyTargetCount(greenTgArn),
    ]);
    this.log.info("Target group health", {
      blue: blueCount,
      green: greenCount,
    });
    if (blueCount > 0 && greenCount === 0) return "blue";
    if (greenCount > 0 && blueCount === 0) return "green";
    this.log.warn("Ambiguous slot state — defaulting active=blue");
    return "blue";
  }

  private async getHealthyTargetCount(tgArn: string): Promise<number> {
    const resp = (await withRetry(() =>
      this.alb.send(
        this.cmd.DescribeTargetHealthCommand({ TargetGroupArn: tgArn }),
      ),
    )) as any;
    return (resp.TargetHealthDescriptions ?? []).filter(
      (t: any) => t.TargetHealth?.State === "healthy",
    ).length;
  }

  private async getListenerRuleArn(blueTgArn: string): Promise<string> {
    const { project, environment, service } = this.cfg;
    const resp = (await withRetry(() =>
      this.alb.send(
        this.cmd.DescribeTargetGroupsCommand({ TargetGroupArns: [blueTgArn] }),
      ),
    )) as any;
    const lbArns = resp.TargetGroups?.[0]?.LoadBalancerArns ?? [];
    if (lbArns.length === 0) {
      throw new Error("Could not find ALB ARN from target group");
    }
    return `arn:aws:elasticloadbalancing:${this.cfg.region}:*:listener-rule/${project}-${environment}-${service}`;
  }

  // -------------------------------------------------------------------------
  // Step 2: Register new task definition
  // -------------------------------------------------------------------------

  async registerNewTaskDefinition(
    _inactiveServiceName: string,
    previousTaskDefinitionArn: string,
  ): Promise<string> {
    const descResp = (await withRetry(() =>
      this.ecs.send(
        this.cmd.DescribeTaskDefinitionCommand({
          taskDefinition: previousTaskDefinitionArn,
        }),
      ),
    )) as any;

    const td = descResp.taskDefinition;
    if (!td) {
      throw new Error(
        `Task definition not found: ${previousTaskDefinitionArn}`,
      );
    }

    const containers = (td.containerDefinitions ?? []).map(
      (c: Record<string, unknown>, idx: number) =>
        idx === 0 ? { ...c, image: this.cfg.imageUri } : c,
    );

    const registerResp = (await withRetry(() =>
      this.ecs.send(
        this.cmd.RegisterTaskDefinitionCommand({
          family: td.family,
          taskRoleArn: td.taskRoleArn,
          executionRoleArn: td.executionRoleArn,
          networkMode: td.networkMode,
          containerDefinitions: containers,
          volumes: td.volumes,
          placementConstraints: td.placementConstraints,
          requiresCompatibilities: td.requiresCompatibilities,
          cpu: td.cpu,
          memory: td.memory,
          tags: [
            { key: "DeployedAt", value: new Date().toISOString() },
            { key: "ImageUri", value: this.cfg.imageUri },
          ],
        }),
      ),
    )) as any;

    const newArn = registerResp.taskDefinition?.taskDefinitionArn;
    if (!newArn) throw new Error("Failed to register new task definition");
    return newArn;
  }

  // -------------------------------------------------------------------------
  // Step 3: Deploy to inactive slot
  // -------------------------------------------------------------------------

  async deployToInactiveSlot(state: DeploymentState): Promise<void> {
    await withRetry(() =>
      this.ecs.send(
        this.cmd.UpdateServiceCommand({
          cluster: this.cfg.clusterName,
          service: state.inactiveServiceName,
          taskDefinition: state.newTaskDefinitionArn,
          desiredCount: 2,
          forceNewDeployment: true,
        }),
      ),
    );
    this.log.info("ECS service update triggered", {
      service: state.inactiveServiceName,
    });
  }

  // -------------------------------------------------------------------------
  // Step 4: Wait for health checks
  // -------------------------------------------------------------------------

  async waitForHealthy(tgArn: string): Promise<void> {
    const deadline = Date.now() + this.cfg.healthCheckTimeoutSeconds * 1000;
    const interval = this.cfg.healthCheckIntervalSeconds * 1000;

    this.log.info("Waiting for target group to become healthy…", {
      tgArn,
      timeoutSeconds: this.cfg.healthCheckTimeoutSeconds,
    });

    while (Date.now() < deadline) {
      const count = await this.getHealthyTargetCount(tgArn);
      this.log.info("Health check poll", { healthyTargets: count });
      if (count >= 1) {
        this.log.success(`Target group healthy (${count} targets)`);
        return;
      }
      await sleep(interval);
    }

    throw new Error(
      `Health check timeout after ${this.cfg.healthCheckTimeoutSeconds}s — ` +
        `no healthy targets in ${tgArn}`,
    );
  }

  // -------------------------------------------------------------------------
  // Step 5: Smoke tests
  // -------------------------------------------------------------------------

  async runSmokeTests(tgArn: string): Promise<void> {
    const resp = (await withRetry(() =>
      this.alb.send(
        this.cmd.DescribeTargetHealthCommand({ TargetGroupArn: tgArn }),
      ),
    )) as any;

    const healthy = (resp.TargetHealthDescriptions ?? []).filter(
      (t: any) => t.TargetHealth?.State === "healthy",
    );
    if (healthy.length === 0) {
      throw new Error("No healthy targets available for smoke testing");
    }

    const targetId = healthy[0].Target?.Id;
    const port = this.cfg.service === "backend" ? 3001 : 80;
    const url = `http://${targetId}:${port}${this.cfg.smokeTestPath}`;
    this.log.info("Running smoke test", { url });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Smoke test failed: HTTP ${res.status}`);
      this.log.success(`Smoke test passed: HTTP ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Shift traffic
  // -------------------------------------------------------------------------

  async shiftTraffic(state: DeploymentState): Promise<void> {
    await withRetry(() =>
      this.alb.send(
        this.cmd.ModifyListenerRuleCommand({
          RuleArn: state.listenerRuleArn,
          Actions: [
            {
              Type: "forward",
              ForwardConfig: {
                TargetGroups: [
                  { TargetGroupArn: state.inactiveTargetGroupArn, Weight: 100 },
                  { TargetGroupArn: state.activeTargetGroupArn, Weight: 0 },
                ],
                TargetGroupStickinessConfig: { Enabled: false },
              },
            },
          ],
        }),
      ),
    );
    this.log.info("ALB listener rule updated", {
      newActive: state.inactiveTargetGroupArn,
    });
  }

  // -------------------------------------------------------------------------
  // Step 7: Drain old slot
  // -------------------------------------------------------------------------

  async drainOldSlot(state: DeploymentState): Promise<void> {
    this.log.info(
      `Waiting ${this.cfg.drainWaitSeconds}s for connections to drain…`,
    );
    await sleep(this.cfg.drainWaitSeconds * 1000);

    await withRetry(() =>
      this.ecs.send(
        this.cmd.UpdateServiceCommand({
          cluster: this.cfg.clusterName,
          service: state.activeServiceName,
          desiredCount: 0,
        }),
      ),
    );
    this.log.info("Old slot scaled to 0", { service: state.activeServiceName });
  }

  // -------------------------------------------------------------------------
  // Rollback
  // -------------------------------------------------------------------------

  async rollback(state: DeploymentState): Promise<void> {
    this.log.warn(`Rolling back — restoring traffic to ${state.activeSlot}`);

    try {
      await withRetry(() =>
        this.alb.send(
          this.cmd.ModifyListenerRuleCommand({
            RuleArn: state.listenerRuleArn,
            Actions: [
              {
                Type: "forward",
                ForwardConfig: {
                  TargetGroups: [
                    { TargetGroupArn: state.activeTargetGroupArn, Weight: 100 },
                    { TargetGroupArn: state.inactiveTargetGroupArn, Weight: 0 },
                  ],
                },
              },
            ],
          }),
        ),
      );
    } catch (err) {
      this.log.error("Failed to restore ALB listener rule", err);
    }

    try {
      await withRetry(() =>
        this.ecs.send(
          this.cmd.UpdateServiceCommand({
            cluster: this.cfg.clusterName,
            service: state.inactiveServiceName,
            desiredCount: 0,
          }),
        ),
      );
    } catch (err) {
      this.log.error("Failed to scale down inactive slot", err);
    }

    this.log.success(`Rollback complete — ${state.activeSlot} is active`);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private buildResult(
    state: DeploymentState | null,
    startedAt: Date,
    success: boolean,
    rolledBack: boolean,
    error?: string,
  ): DeploymentResult {
    return {
      success,
      previousSlot: state?.activeSlot ?? "blue",
      newActiveSlot: success
        ? (state?.inactiveSlot ?? "green")
        : (state?.activeSlot ?? "blue"),
      newTaskDefinitionArn: state?.newTaskDefinitionArn ?? "",
      durationSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
      rolledBack,
      error,
    };
  }
}
