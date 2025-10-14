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

// =========================================================
// NOVA ROTA PARA RENOMEAR UM GRUPO DE CONTRATO
// =========================================================
router.put('/:oldName', protect, adminOnly, async (req, res) => {
    const { oldName } = req.params;
    const { newName } = req.body;

    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
        return res.status(400).json({ message: 'O novo nome do contrato é obrigatório.' });
    }

    try {
        // Renomeia o grupo de contrato em todos os locais e configurações de ciclo associados
        await prisma.$transaction([
            prisma.location.updateMany({
                where: { contractGroup: oldName },
                data: { contractGroup: newName }
            }),
            prisma.contractConfig.updateMany({
                where: { contractGroup: oldName },
                data: { contractGroup: newName }
            }),
             // Isso é importante para registros de auditoria ou outros modelos que se referem a 'contractGroup'
            prisma.serviceRecord.updateMany({
                 where: { contractGroup: oldName },
                 data: { contractGroup: newName }
            }),
             // E, se existir, atualiza as atribuições de usuário
            prisma.user.updateMany({
                where: {
                    assignments: {
                        some: {
                            contractGroup: oldName
                        }
                    }
                },
                data: {
                    assignments: {
                        updateMany: {
                            where: { contractGroup: oldName },
                            data: { contractGroup: newName }
                        }
                    }
                }
            })
        ]);

        res.status(200).json({ message: `Grupo de contrato '${oldName}' renomeado para '${newName}' com sucesso.` });
    } catch (error) {
        console.error("Erro ao renomear o grupo de contrato:", error);
        res.status(500).json({ message: 'Erro ao renomear o grupo de contrato', error: error.message });
    }
});

// =========================================================
// NOVA ROTA PARA EXCLUIR UM GRUPO DE CONTRATO
// =========================================================
router.delete('/:name', protect, adminOnly, async (req, res) => {
    const { name } = req.params;
    const { password } = req.body;
    
    try {
        // Valida a senha do usuário
        const user = await prisma.user.findFirst({
            where: { id: req.user.id },
        });
        
        if (!user || !await bcrypt.compare(password, user.passwordHash)) {
            return res.status(401).json({ message: 'Senha incorreta.' });
        }

        // Verifica se existem registros de serviço para este grupo
        const serviceRecordsCount = await prisma.serviceRecord.count({
            where: { contractGroup: name }
        });

        if (serviceRecordsCount > 0) {
            return res.status(400).json({ message: `Não é possível excluir o contrato, pois ele possui ${serviceRecordsCount} registros de serviço associados.` });
        }

        await prisma.$transaction([
            prisma.location.deleteMany({
                where: { contractGroup: name }
            }),
            prisma.contractConfig.deleteMany({
                where: { contractGroup: name }
            }),
            prisma.user.updateMany({
                where: {
                    assignments: {
                        some: {
                            contractGroup: name
                        }
                    }
                },
                data: {
                    assignments: {
                        deleteMany: {
                            where: { contractGroup: name }
                        }
                    }
                }
            })
        ]);

        res.status(200).json({ message: `Grupo de contrato '${name}' e seus locais foram excluídos com sucesso.` });
    } catch (error) {
        console.error("Erro ao excluir o grupo de contrato:", error);
        res.status(500).json({ message: 'Erro ao excluir o grupo de contrato', error: error.message });
    }
});


module.exports = router;
