/**
 * Database seed - Create initial account
 */
import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default paper trading account if none exists
  const existingAccount = await prisma.account.findFirst();
  if (!existingAccount) {
    const account = await prisma.account.create({
      data: {
        id: uuid(),
        name: 'Paper Trading',
        balance: 500,
        initialBalance: 500,
      },
    });
    console.log(`Created account: ${account.id}`);
  } else {
    console.log(`Account already exists: ${existingAccount.id}`);
  }

  console.log('Seed complete.');
}

main()
  .catch(e => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
