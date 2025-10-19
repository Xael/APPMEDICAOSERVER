const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const prisma = new PrismaClient();

// ==========================================================
// 📜 GET / - Rota para buscar todos os logs de auditoria
// ==========================================================
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: {
        timestamp: 'desc', // Ordena os logs do mais recente para o mais antigo
      },
    });
    res.json(logs);
  } catch (error) {
    console.error("Erro ao buscar o log de auditoria:", error);
    res.status(500).json({ message: 'Erro ao buscar o log de auditoria', error: error.message });
  }
});

// ==========================================================
// ➕ POST / - Rota para CRIAR um novo log (já usada pelo front-end)
// ==========================================================
router.post('/', protect, adminOnly, async (req, res) => {
    const { action, recordId, details } = req.body;
    const { id: adminId, name: adminUsername } = req.user; // Pega o admin logado

    if (!action || !details) {
        return res.status(400).json({ message: 'Ação e detalhes são obrigatórios.' });
    }

    try {
        const newLogEntry = await prisma.auditLog.create({
            data: {
                adminId,
                adminUsername,
                action,
                recordId: recordId ? parseInt(recordId) : undefined,
                details,
            },
        });
        res.status(201).json(newLogEntry);
    } catch (error) {
        console.error('Falha ao criar entrada no log de auditoria via POST:', error);
        res.status(500).json({ message: 'Erro ao salvar entrada de log.' });
    }
});


module.exports = router;
