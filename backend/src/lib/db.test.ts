import { prisma } from "./prisma";
import {
  testConnection,
  createToken,
  getTokenByAddress,
  createBurnRecord,
} from "./db";

async function runTests() {
  // 1. Connection test
  await testConnection();

  // 2. Create token
  const token = await createToken({
    address: "0xTEST_ADDRESS",
    creator: "0xCREATOR",
    name: "Test Token",
    symbol: "TEST",
    totalSupply: BigInt("1000000000000000000000"),
    initialSupply: BigInt("1000000000000000000000"),
  });
  console.log("✅ Token created:", token.id);

  // 3. Read token
  const found = await getTokenByAddress("0xTEST_ADDRESS");
  console.log("✅ Token found:", found?.name);

  // 4. Create burn record
  const burn = await createBurnRecord({
    tokenId: token.id,
    from: "0xUSER",
    amount: BigInt("1000000000000000000"),
    burnedBy: "0xUSER",
    txHash: "0xUNIQUE_TX_HASH",
  });
  console.log("✅ Burn record created:", burn.id);

  // 5. Cleanup
  await prisma.burnRecord.delete({ where: { id: burn.id } });
  await prisma.token.delete({ where: { id: token.id } });
  console.log("✅ Cleanup complete");

  await prisma.$disconnect();
}

runTests().catch(console.error);
