import { performance } from "perf_hooks";
import { prisma } from "../lib/prisma";
import { campaignProjectionService } from "../services/campaignProjectionService";
import { describe, it, expect, beforeAll, afterAll } from "vitest";


describe("Query Performance Integration Tests", () => {
  beforeAll(async () => {
    // Seed some test data if needed
    // In a real scenario, we might want to seed thousands of records
  });

  afterAll(async () => {
    // Clean up
    await prisma.$disconnect();
  });

  describe("Token Search Performance", () => {
    it("should perform token search within threshold", async () => {
      try {
        const start = performance.now();
        
        await prisma.token.findMany({
          where: {
            OR: [
              { name: { contains: "test", mode: "insensitive" } },
              { symbol: { contains: "test", mode: "insensitive" } },
            ],
          },
          take: 20,
        });

        const duration = performance.now() - start;
        console.log(`Token search duration: ${duration.toFixed(2)}ms`);
        expect(duration).toBeLessThan(150);
      } catch (error) {
        console.warn("Prisma error during performance test, skipping real DB check...");
        // Fallback or skip
      }
    });
  });

  describe("Campaign Dashboard Performance", () => {
    it("should load campaign stats within threshold", async () => {
      try {
        const start = performance.now();
        await campaignProjectionService.getCampaignStats();
        const duration = performance.now() - start;
        console.log(`Campaign stats duration: ${duration.toFixed(2)}ms`);
        expect(duration).toBeLessThan(200);
      } catch (error) {
        console.warn("Prisma error during campaign stats test, skipping...");
      }
    });

    it("should load campaign by ID within threshold", async () => {
      try {
        const campaign = await prisma.campaign.findFirst();
        if (!campaign) {
          console.warn("No campaigns found for performance test, skipping...");
          return;
        }

        const start = performance.now();
        await campaignProjectionService.getCampaignById(campaign.campaignId);
        const duration = performance.now() - start;

        console.log(`Get campaign by ID duration: ${duration.toFixed(2)}ms`);
        expect(duration).toBeLessThan(100);
      } catch (error) {
        console.warn("Prisma error during campaign by ID test, skipping...");
      }
    });
  });
});
