// Em prisma/seed.js

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('Seed: criando/atualizando admin, unidades e serviços padrão...');

  // 1. Garante o usuário admin
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', salt);

  const admin = await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL || 'admin@crb.com' },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL || 'admin@crb.com',
      name: 'Administrador',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });
  console.log(`✔ Admin garantido: ${admin.email}`);

  // 2. Cria as unidades de medida padrão
  const unitM2 = await prisma.unit.upsert({
    where: { id: 1 }, // Usando ID fixo para consistência
    update: {},
    create: { id: 1, name: 'Metros Quadrados', symbol: 'm²' },
  });

  const unitMlinear = await prisma.unit.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: 'Metros Lineares', symbol: 'm linear' },
  });
  console.log('✔ Unidades padrão garantidas: m² e m linear');


  // 3. Cria os serviços padrão, conectando com as unidades criadas
  const defaultServices = [
    { name: 'Varrição Manual', unitId: unitMlinear.id },
    { name: 'Roçada', unitId: unitM2.id },
    { name: 'Limpeza de Vidro', unitId: unitM2.id },
  ];

  for (const service of defaultServices) {
    await prisma.service.upsert({
      where: { name: service.name },
      update: { unitId: service.unitId },
      create: {
        name: service.name,
        unitId: service.unitId,
      },
    });
  }
  console.log('✔ Serviços padrão garantidos.');
  
  console.log('Seed finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
