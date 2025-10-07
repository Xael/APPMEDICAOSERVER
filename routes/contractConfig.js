const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const prisma = new PrismaClient();

// Rota para buscar todas as configurações de contrato
router.get('/', protect, async (req, res) => {
  try {
    const configs = await prisma.contractConfig.findMany();
    res.json(configs);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar configurações de contrato', error: error.message });
  }
});

// Rota para criar ou atualizar as configurações de contrato
router.post('/', protect, adminOnly, async (req, res) => {
  const { configs } = req.body;
  
  if (!configs || !Array.isArray(configs)) {
    return res.status(400).json({ message: 'Formato de dados inválido.' });
  }

  try {
    const transactions = configs.map(config => 
      prisma.contractConfig.upsert({
        where: { contractGroup: config.contractGroup },
        update: { cycleStartDay: parseInt(config.cycleStartDay, 10) || 1 },
        create: {
          contractGroup: config.contractGroup,
          cycleStartDay: parseInt(config.cycleStartDay, 10) || 1,
        },
      })
    );

    await prisma.$transaction(transactions);
    res.status(200).json({ message: 'Configurações salvas com sucesso' });
  } catch (error) {
    console.error("Erro ao salvar configurações:", error);
    res.status(500).json({ message: 'Erro ao salvar configurações', error: error.message });
  }
});

module.exports = router;
