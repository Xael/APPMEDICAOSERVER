const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// ======================================================
// 🔹 ROTA: Buscar todas as configurações de contrato
// ======================================================
router.get('/', protect, async (req, res) => {
  try {
    const configs = await prisma.contractConfig.findMany();
    res.json(configs);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar configurações de contrato',
      error: error.message,
    });
  }
});

// ======================================================
// 🔹 ROTA: Criar ou atualizar as configurações de contrato
// ======================================================
router.post('/', protect, adminOnly, async (req, res) => {
  const { configs } = req.body;

  if (!configs || !Array.isArray(configs)) {
    return res.status(400).json({ message: 'Formato de dados inválido.' });
  }

  try {
    const transactions = configs.map((config) =>
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
    res.status(200).json({ message: 'Configurações salvas com sucesso.' });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    res.status(500).json({
      message: 'Erro ao salvar configurações',
      error: error.message,
    });
  }
});

// ======================================================
// 🔹 ROTA: Renomear um grupo de contrato/cidade
// ======================================================
router.put('/:oldName', protect, adminOnly, async (req, res) => {
  const oldName = decodeURIComponent(req.params.oldName || '').trim();
  const { newName } = req.body;

  if (!newName || typeof newName !== 'string' || newName.trim() === '') {
    return res.status(400).json({ message: 'O novo nome do contrato é obrigatório.' });
  }

  try {
    const allUsers = await prisma.user.findMany();

    const transactions = [
      // Atualiza nome da cidade nos locais
      prisma.Location.updateMany({
        where: { city: oldName },
        data: { city: newName },
      }),
      // Atualiza nome do contrato nas configurações
      prisma.contractConfig.updateMany({
        where: { contractGroup: oldName },
        data: { contractGroup: newName },
      }),
      // Atualiza nome do contrato nos registros
      prisma.Record.updateMany({
        where: { contractGroup: oldName },
        data: { contractGroup: newName },
      }),
    ];

    // Atualiza assignments dos usuários
    for (const user of allUsers) {
      if (!user.assignments) continue;

      const updatedAssignments = user.assignments.map((a) =>
        a.contractGroup === oldName ? { ...a, contractGroup: newName } : a
      );

      if (JSON.stringify(user.assignments) !== JSON.stringify(updatedAssignments)) {
        transactions.push(
          prisma.user.update({
            where: { id: user.id },
            data: { assignments: updatedAssignments },
          })
        );
      }
    }

    await prisma.$transaction(transactions);
    res
      .status(200)
      .json({ message: `Grupo de contrato '${oldName}' renomeado para '${newName}' com sucesso.` });
  } catch (error) {
    console.error('Erro ao renomear o grupo de contrato:', error);
    res.status(500).json({
      message: 'Erro ao renomear o grupo de contrato',
      error: error.message,
    });
  }
});

// ======================================================
// 🔹 ROTA: Excluir um grupo de contrato/cidade
// ======================================================
router.delete('/:name', protect, adminOnly, async (req, res) => {
  const name = decodeURIComponent(req.params.name || '').trim();
  const { password } = req.body;

  if (!name) return res.status(400).json({ message: 'Nome do contrato é obrigatório.' });
  if (!password) return res.status(400).json({ message: 'Senha administrativa é obrigatória.' });

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Senha incorreta.' });
    }

    // Verifica se há registros vinculados
    const recordsCount = await prisma.Record.count({
      where: { contractGroup: name },
    });

    if (recordsCount > 0) {
      return res.status(400).json({
        message: `Não é possível excluir o contrato, pois ele possui ${recordsCount} registros de serviço associados.`,
      });
    }

    const allUsers = await prisma.user.findMany();

    const transactions = [
      prisma.Location.deleteMany({ where: { city: name } }),
      prisma.contractConfig.deleteMany({ where: { contractGroup: name } }),
    ];

    // Remove assignments vinculados
    for (const user of allUsers) {
      if (!user.assignments) continue;

      const updatedAssignments = user.assignments.filter(
        (a) => a.contractGroup !== name
      );

      if (JSON.stringify(user.assignments) !== JSON.stringify(updatedAssignments)) {
        transactions.push(
          prisma.user.update({
            where: { id: user.id },
            data: { assignments: updatedAssignments },
          })
        );
      }
    }

    await prisma.$transaction(transactions);
    res.status(200).json({
      message: `Grupo de contrato '${name}' e seus locais foram excluídos com sucesso.`,
    });
  } catch (error) {
    console.error('Erro ao excluir o grupo de contrato:', error);
    res.status(500).json({
      message: 'Erro ao excluir o grupo de contrato',
      error: error.message,
    });
  }
});

module.exports = router;
