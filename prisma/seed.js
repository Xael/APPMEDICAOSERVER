// Em prisma/seed.js

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs'); // <--- ADICIONADO
const csv = require('csv-parser'); // <--- ADICIONADO
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
    where: { id: 1 },
    update: {},
    create: { id: 1, name: 'Metros Quadrados', symbol: 'm²' },
  });

  const unitMlinear = await prisma.unit.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, name: 'Metros Lineares', symbol: 'm linear' },
  });
  console.log('✔ Unidades padrão garantidas: m² e m linear');

  // 3. Cria os serviços padrão
  const defaultServices = [
    { name: 'Varrição Manual', unitId: unitMlinear.id },
    { name: 'Roçada', unitId: unitM2.id },
    { name: 'Limpeza de Vidro', unitId: unitM2.id },
  ];

  for (const service of defaultServices) {
    await prisma.service.upsert({
      where: { name: service.name },
      update: { unitId: service.unitId },
      create: { name: service.name, unitId: service.unitId },
    });
  }
  console.log('✔ Serviços padrão garantidos.');

  // 4. LIMPA E IMPORTA OS LOCAIS (BAIRROS E RUAS)
  // ----------------------------------------------------
  console.log('Iniciando importação de locais...');
  const csvPath = 'prisma/import.csv';

  if (!fs.existsSync(csvPath)) {
    console.warn(`Arquivo ${csvPath} não encontrado. Pulando importação de locais.`);
  } else {
    // 4.1. Limpa locais antigos (para o seed ser "resetável")
    // O migrate reset já faz isso, mas é bom ter para rodar `db seed`
    await prisma.locationService.deleteMany({});
    await prisma.location.deleteMany({});
    console.log('Locais antigos removidos.');

    // 4.2. Cria Bairros
    const bairrosStream = fs.createReadStream(csvPath).pipe(csv());
    const bairroMap = new Map(); // Para guardar o ID de cada bairro

    console.log('Passo 1 (Locais): Criando Bairros (isGroup: true)...');
    for await (const row of bairrosStream) {
      if (row.bairro && !row.rua) {
        const bairroName = row.bairro.trim();
        const cityName = row.cidade.trim();
        const uniqueKey = `${cityName}|${bairroName}`; // Chave única

        if (!bairroMap.has(uniqueKey)) {
          const bairro = await prisma.location.create({
            data: {
              city: cityName,
              name: bairroName,
              lat: row.lat ? parseFloat(row.lat) : null,
              lng: row.lng ? parseFloat(row.lng) : null,
              observations: row.observacoes || null,
              isGroup: true, // <-- A MÁGICA ACONTECE AQUI
              parentId: null,
            },
          });
          bairroMap.set(uniqueKey, bairro.id); // Salva o ID do Bairro
          console.log(`  Bairro criado: ${bairro.name} (Cidade: ${bairro.city})`);
        }
      }
    }

    // 4.3. Cria Ruas e vincula
    const ruasStream = fs.createReadStream(csvPath).pipe(csv());
    console.log('Passo 2 (Locais): Criando Ruas (isGroup: false) e vinculando...');
    for await (const row of ruasStream) {
      if (row.bairro && row.rua) {
        const bairroName = row.bairro.trim();
        const cityName = row.cidade.trim();
        const uniqueKey = `${cityName}|${bairroName}`;

        const parentId = bairroMap.get(uniqueKey); // Busca o ID do Bairro

        if (!parentId) {
          console.warn(`  Atenção: A rua "${row.rua}" não encontrou o Bairro "${bairroName}". Pulando...`);
          continue;
        }

        await prisma.location.create({
          data: {
            city: cityName,
            name: row.rua.trim(),
            lat: row.lat ? parseFloat(row.lat) : null,
            lng: row.lng ? parseFloat(row.lng) : null,
            observations: row.observacoes || null,
            isGroup: false,
            parentId: parentId, // <-- A MÁGICA ACONTECE AQUI
          },
        });
        console.log(`  Rua criada: ${row.rua.trim()} (em ${bairroName})`);
      }
    }
    console.log('✔ Locais importados com sucesso.');
  }

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
