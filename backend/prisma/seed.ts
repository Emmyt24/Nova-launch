import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed Token
  const token = await prisma.token.upsert({
    where: { address: '0xSEED_TOKEN_ADDRESS_001' },
    update: {},
    create: {
      address:       '0xSEED_TOKEN_ADDRESS_001',
      creator:       '0xCREATOR_ADDRESS_001',
      name:          'Seed Token',
      symbol:        'SEED',
      decimals:      18,
      totalSupply:   BigInt('1000000000000000000000000'), // 1M tokens
      initialSupply: BigInt('1000000000000000000000000'),
      totalBurned:   BigInt('0'),
      burnCount:     0,
    },
  });

  console.log(`Created token: ${token.symbol} (${token.id})`);

  // Seed User
  const user = await prisma.user.upsert({
    where: { address: '0xUSER_ADDRESS_001' },
    update: {},
    create: { address: '0xUSER_ADDRESS_001' },
  });

  console.log(`Created user: ${user.address}`);

  // Seed BurnRecord
  const burn = await prisma.burnRecord.upsert({
    where: { txHash: '0xSEED_TX_HASH_001' },
    update: {},
    create: {
      tokenId:     token.id,
      from:        user.address,
      amount:      BigInt('1000000000000000000000'), // 1000 tokens
      burnedBy:    user.address,
      isAdminBurn: false,
      txHash:      '0xSEED_TX_HASH_001',
    },
  });

  console.log(`Created burn record: ${burn.id}`);

  // Seed Analytics
  const analytics = await prisma.analytics.upsert({
    where: {
      tokenId_date: {
        tokenId: token.id,
        date:    new Date('2025-01-01'),
      },
    },
    update: {},
    create: {
      tokenId:       token.id,
      date:          new Date('2025-01-01'),
      burnVolume:    BigInt('1000000000000000000000'),
      burnCount:     1,
      uniqueBurners: 1,
    },
  });

  console.log(`Created analytics record: ${analytics.id}`);
  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());