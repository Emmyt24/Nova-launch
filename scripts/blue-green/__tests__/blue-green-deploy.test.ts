/**
 * Tests for blue-green-deploy.ts
 *
 * All AWS SDK calls are intercepted via injected mock clients and
 * CommandFactories — no real SDK modules are loaded.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Logger,
  sleep,
  withRetry,
  BlueGreenDeployer,
  type BlueGreenConfig,
  type Slot,
  type CommandFactories,
} from "../blue-green-deploy";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<BlueGreenConfig> = {}): BlueGreenConfig {
  return {
    region: "us-east-1",
    clusterName: "nova-launch-production",
    environment: "production",
    project: "nova-launch",
    imageUri:
      "123456789012.dkr.ecr.us-east-1.amazonaws.com/nova-launch/production/backend:v2",
    service: "backend",
    healthCheckTimeoutSeconds: 5,
    healthCheckIntervalSeconds: 1,
    minHealthyPercent: 100,
    runSmokeTests: false,
    smokeTestPath: "/health",
    drainWaitSeconds: 0,
    dryRun: false,
    ...overrides,
  };
}

/** Stub command factories — objects whose prototype.constructor.name matches the command name */
function makeCommands(): CommandFactories {
  const make = (name: string) => (input: unknown) => {
    const obj = Object.create({ constructor: { name } });
    obj.input = input;
    return obj;
  };
  return {
    DescribeServicesCommand: make("DescribeServicesCommand"),
    UpdateServiceCommand: make("UpdateServiceCommand"),
    DescribeTaskDefinitionCommand: make("DescribeTaskDefinitionCommand"),
    RegisterTaskDefinitionCommand: make("RegisterTaskDefinitionCommand"),
    DescribeTargetHealthCommand: make("DescribeTargetHealthCommand"),
    DescribeTargetGroupsCommand: make("DescribeTargetGroupsCommand"),
    ModifyListenerRuleCommand: make("ModifyListenerRuleCommand"),
  };
}

const BLUE_SERVICE = {
  serviceName: "nova-launch-production-backend-blue",
  taskDefinition:
    "arn:aws:ecs:us-east-1:123:task-definition/nova-launch-production-backend:1",
  loadBalancers: [
    {
      targetGroupArn:
        "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/blue/abc",
    },
  ],
};
const GREEN_SERVICE = {
  serviceName: "nova-launch-production-backend-green",
  taskDefinition:
    "arn:aws:ecs:us-east-1:123:task-definition/nova-launch-production-backend:1",
  loadBalancers: [
    {
      targetGroupArn:
        "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/green/def",
    },
  ],
};
const HEALTHY_RESP = {
  TargetHealthDescriptions: [
    { TargetHealth: { State: "healthy" }, Target: { Id: "10.0.1.5" } },
  ],
};
const TG_RESP = {
  TargetGroups: [
    {
      LoadBalancerArns: [
        "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/test/abc",
      ],
    },
  ],
};
const NEW_TD_ARN =
  "arn:aws:ecs:us-east-1:123:task-definition/nova-launch-production-backend:2";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

describe("Logger", () => {
  it("info logs to console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new Logger("test").info("hello");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("hello"));
    spy.mockRestore();
  });

  it("info includes metadata when provided", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new Logger("test").info("msg", { key: "value" });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"key"'));
    spy.mockRestore();
  });

  it("success logs ✅", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new Logger("test").success("done");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("✅"));
    spy.mockRestore();
  });

  it("warn logs to console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    new Logger("test").warn("careful");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("careful"));
    spy.mockRestore();
  });

  it("error logs to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    new Logger("test").error("boom", new Error("e"));
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
      expect.any(Error),
    );
    spy.mockRestore();
  });

  it("step includes step numbers", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new Logger("test").step(3, 7, "doing something");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[3/7]"));
    spy.mockRestore();
  });

  it("uses default prefix 'blue-green'", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    new Logger().info("test");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("[blue-green]"));
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------

describe("sleep", () => {
  it("resolves after the specified delay", async () => {
    vi.useFakeTimers();
    const p = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("resolves immediately for 0ms", async () => {
    vi.useFakeTimers();
    const p = sleep(0);
    vi.advanceTimersByTime(0);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

describe("withRetry", () => {
  it("returns result on first successful attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await withRetry(fn, 3, 0)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("ok");
    expect(await withRetry(fn, 3, 0)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetry(fn, 3, 0)).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries exactly maxAttempts times", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("fail"));
    await expect(withRetry(fn, 5, 0)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it("succeeds on the last attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("1"))
      .mockRejectedValueOnce(new Error("2"))
      .mockResolvedValueOnce("third");
    expect(await withRetry(fn, 3, 0)).toBe("third");
  });
});

// ---------------------------------------------------------------------------
// BlueGreenDeployer.deploy — dry-run
// ---------------------------------------------------------------------------

describe("BlueGreenDeployer.deploy (dry-run)", () => {
  it("returns success=false (no-op) without making UpdateService calls", async () => {
    const ecsSend = vi
      .fn()
      .mockResolvedValue({ services: [BLUE_SERVICE, GREEN_SERVICE] });
    const albSend = vi.fn().mockResolvedValue({ ...HEALTHY_RESP, ...TG_RESP });

    const deployer = new BlueGreenDeployer(makeConfig({ dryRun: true }), {
      ecs: { send: ecsSend },
      alb: { send: albSend },
      commands: makeCommands(),
    });

    const result = await deployer.deploy();

    expect(result.rolledBack).toBe(false);
    // No UpdateServiceCommand should have been called
    const updateCalls = ecsSend.mock.calls.filter(
      ([cmd]: [any]) =>
        Object.getPrototypeOf(cmd)?.constructor?.name ===
        "UpdateServiceCommand",
    );
    expect(updateCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// BlueGreenDeployer.registerNewTaskDefinition
// ---------------------------------------------------------------------------

describe("BlueGreenDeployer.registerNewTaskDefinition", () => {
  it("updates the container image and returns new ARN", async () => {
    const newImage =
      "123456789012.dkr.ecr.us-east-1.amazonaws.com/nova-launch/production/backend:v2";
    let registeredContainers: any[] = [];

    const ecsSend = vi.fn().mockImplementation(async (cmd: any) => {
      const name = Object.getPrototypeOf(cmd)?.constructor?.name;
      if (name === "DescribeTaskDefinitionCommand") {
        return {
          taskDefinition: {
            family: "nova-launch-production-backend",
            taskDefinitionArn:
              "arn:aws:ecs:us-east-1:123:task-definition/nova-launch-production-backend:1",
            containerDefinitions: [{ name: "backend", image: "old-image:v1" }],
            cpu: "512",
            memory: "1024",
            networkMode: "awsvpc",
            requiresCompatibilities: ["FARGATE"],
            executionRoleArn: "arn:aws:iam::123:role/exec",
            taskRoleArn: "arn:aws:iam::123:role/task",
          },
        };
      }
      if (name === "RegisterTaskDefinitionCommand") {
        registeredContainers = cmd.input?.containerDefinitions ?? [];
        return { taskDefinition: { taskDefinitionArn: NEW_TD_ARN } };
      }
      throw new Error(`Unexpected: ${name}`);
    });

    const deployer = new BlueGreenDeployer(makeConfig({ imageUri: newImage }), {
      ecs: { send: ecsSend },
      alb: { send: vi.fn() },
      commands: makeCommands(),
    });

    const arn = await deployer.registerNewTaskDefinition(
      "nova-launch-production-backend-green",
      "arn:aws:ecs:us-east-1:123:task-definition/nova-launch-production-backend:1",
    );

    expect(arn).toBe(NEW_TD_ARN);
    expect(registeredContainers[0].image).toBe(newImage);
  });

  it("throws when task definition is not found", async () => {
    const ecsSend = vi.fn().mockResolvedValue({ taskDefinition: null });

    const deployer = new BlueGreenDeployer(makeConfig(), {
      ecs: { send: ecsSend },
      alb: { send: vi.fn() },
      commands: makeCommands(),
    });

    await expect(
      deployer.registerNewTaskDefinition(
        "svc-green",
        "arn:aws:ecs:us-east-1:123:task-definition/missing:1",
      ),
    ).rejects.toThrow("Task definition not found");
  });
});

// ---------------------------------------------------------------------------
// BlueGreenDeployer.waitForHealthy
// ---------------------------------------------------------------------------

describe("BlueGreenDeployer.waitForHealthy", () => {
  it("resolves when at least one healthy target exists", async () => {
    const albSend = vi.fn().mockResolvedValue(HEALTHY_RESP);

    const deployer = new BlueGreenDeployer(
      makeConfig({
        healthCheckTimeoutSeconds: 30,
        healthCheckIntervalSeconds: 1,
      }),
      {
        ecs: { send: vi.fn() },
        alb: { send: albSend },
        commands: makeCommands(),
      },
    );

    await expect(
      deployer.waitForHealthy(
        "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/green/abc",
      ),
    ).resolves.toBeUndefined();
  });

  it("throws on timeout when no healthy targets appear", async () => {
    const albSend = vi.fn().mockResolvedValue({
      TargetHealthDescriptions: [{ TargetHealth: { State: "initial" } }],
    });

    const deployer = new BlueGreenDeployer(
      makeConfig({
        healthCheckTimeoutSeconds: 1,
        healthCheckIntervalSeconds: 1,
      }),
      {
        ecs: { send: vi.fn() },
        alb: { send: albSend },
        commands: makeCommands(),
      },
    );

    await expect(
      deployer.waitForHealthy(
        "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/green/abc",
      ),
    ).rejects.toThrow("Health check timeout");
  });
});

// ---------------------------------------------------------------------------
// BlueGreenDeployer.rollback
// ---------------------------------------------------------------------------

describe("BlueGreenDeployer.rollback", () => {
  it("calls ModifyListenerRuleCommand to restore traffic to active slot", async () => {
    const albSend = vi.fn().mockResolvedValue({});
    const ecsSend = vi.fn().mockResolvedValue({});

    const deployer = new BlueGreenDeployer(makeConfig(), {
      ecs: { send: ecsSend },
      alb: { send: albSend },
      commands: makeCommands(),
    });

    const state = {
      activeSlot: "blue" as Slot,
      inactiveSlot: "green" as Slot,
      activeServiceName: "nova-launch-production-backend-blue",
      inactiveServiceName: "nova-launch-production-backend-green",
      activeTargetGroupArn:
        "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/blue/abc",
      inactiveTargetGroupArn:
        "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/green/def",
      listenerRuleArn:
        "arn:aws:elasticloadbalancing:us-east-1:123:listener-rule/app/test/abc/rule/1",
      previousTaskDefinitionArn:
        "arn:aws:ecs:us-east-1:123:task-definition/nova-launch-production-backend:1",
      newTaskDefinitionArn: NEW_TD_ARN,
      startedAt: new Date(),
    };

    await deployer.rollback(state);

    expect(albSend).toHaveBeenCalled();
    const albCmd = albSend.mock.calls[0][0];
    expect(Object.getPrototypeOf(albCmd)?.constructor?.name).toBe(
      "ModifyListenerRuleCommand",
    );

    expect(ecsSend).toHaveBeenCalled();
    const ecsCmd = ecsSend.mock.calls[0][0];
    expect(Object.getPrototypeOf(ecsCmd)?.constructor?.name).toBe(
      "UpdateServiceCommand",
    );
  });

  it("does not throw even if ALB call fails during rollback", async () => {
    const albSend = vi.fn().mockRejectedValue(new Error("ALB error"));
    const ecsSend = vi.fn().mockResolvedValue({});

    const deployer = new BlueGreenDeployer(makeConfig(), {
      ecs: { send: ecsSend },
      alb: { send: albSend },
      commands: makeCommands(),
    });

    const state = {
      activeSlot: "blue" as Slot,
      inactiveSlot: "green" as Slot,
      activeServiceName: "nova-launch-production-backend-blue",
      inactiveServiceName: "nova-launch-production-backend-green",
      activeTargetGroupArn:
        "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/blue/abc",
      inactiveTargetGroupArn:
        "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/green/def",
      listenerRuleArn:
        "arn:aws:elasticloadbalancing:us-east-1:123:listener-rule/app/test/abc/rule/1",
      previousTaskDefinitionArn:
        "arn:aws:ecs:us-east-1:123:task-definition/nova-launch-production-backend:1",
      newTaskDefinitionArn: NEW_TD_ARN,
      startedAt: new Date(),
    };

    await expect(deployer.rollback(state)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// BlueGreenDeployer.deploy — failure triggers rollback
// ---------------------------------------------------------------------------

describe("BlueGreenDeployer.deploy — failure triggers rollback", () => {
  it("returns rolledBack=true when registerNewTaskDefinition fails", async () => {
    const ecsSend = vi.fn().mockImplementation(async (cmd: any) => {
      const name = Object.getPrototypeOf(cmd)?.constructor?.name;
      if (name === "DescribeServicesCommand") {
        return { services: [BLUE_SERVICE, GREEN_SERVICE] };
      }
      if (name === "DescribeTaskDefinitionCommand") {
        throw new Error("Task definition not found");
      }
      // UpdateServiceCommand for rollback
      return {};
    });

    const albSend = vi.fn().mockResolvedValue({ ...HEALTHY_RESP, ...TG_RESP });

    const deployer = new BlueGreenDeployer(makeConfig(), {
      ecs: { send: ecsSend },
      alb: { send: albSend },
      commands: makeCommands(),
    });

    const result = await deployer.deploy();

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.error).toContain("Task definition not found");
  });
});
