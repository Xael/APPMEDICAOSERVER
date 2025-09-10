// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('Seed: criando/atualizando admin e serviços padrão...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@crb.com';
  const adminPass  = process.env.ADMIN_PASSWORD || 'admin123';

  const hash = await bcrypt.hash(adminPass, 10);

  // Garante que o admin sempre exista e esteja atualizado
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { password: hash, role: 'ADMIN', name: 'Administrador' },
    create: { name: 'Administrador', email: adminEmail, password: hash, role: 'ADMIN' },
  });
  console.log(`✔ Admin garantido: ${adminEmail}`);

  // Serviços padrão
  const defaults = [
    { name: 'Varrição Manual', unit: 'm linear' },
    { name: 'Roçada Mecanizada', unit: 'm²' },
    { name: 'Capina e Limpeza de Meio Fio', unit: 'm linear' },
    { name: 'Pintura de Meio Fio', unit: 'm linear' },
    { name: 'Coleta de Entulho', unit: 'm²' },
  ];

  for (const s of defaults) {
    await prisma.service.upsert({
      where: { name: s.name },
      update: { unit: s.unit },
      create: s,
    });
    console.log(`✔ Serviço garantido: ${s.name}`);
  }

  console.log('✔ Seed finalizado com sucesso');
}

main()
  .catch(e => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
