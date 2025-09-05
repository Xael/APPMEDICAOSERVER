// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('Seed: criando admin e serviços padrão (se necessário)...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@crb.com';
  const adminPass  = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const hash = await bcrypt.hash(adminPass, 10);
    await prisma.user.create({
      data: { name: 'Administrador', email: adminEmail, password: hash, role: 'ADMIN' },
    });
    console.log(`✔ Admin criado: ${adminEmail}`);
  } else {
    console.log('↺ Admin já existe — ok');
  }

  const defaults = [
    { name: 'Varrição Manual', unit: 'm linear' },
    { name: 'Roçada Mecanizada', unit: 'm²' },
    { name: 'Capina e Limpeza de Meio Fio', unit: 'm linear' },
    { name: 'Pintura de Meio Fio', unit: 'm linear' },
    { name: 'Coleta de Entulho', unit: 'm²' },
  ];

  for (const s of defaults) {
    const found = await prisma.service.findFirst({ where: { name: s.name } });
    if (!found) {
      await prisma.service.create({ data: s });
      console.log(`✔ Serviço criado: ${s.name}`);
    }
  }

  console.log('✔ Seed finalizado');
}

main().catch(e => {
  console.error('Seed error:', e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
