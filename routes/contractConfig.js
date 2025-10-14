const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const bcrypt = require('bcryptjs'); // Usando bcryptjs
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

// ROTA CORRIGIDA PARA RENOMEAR UM GRUPO DE CONTRATO
router.put('/:oldName', protect, adminOnly, async (req, res) => {
    const { oldName } = req.params;
    const { newName } = req.body;

    if (!newName || typeof newName !== 'string' || newName.trim() === '') {
        return res.status(400).json({ message: 'O novo nome do contrato é obrigatório.' });
    }

    try {
        const usersToUpdate = await prisma.user.findMany({
            // SINTAXE CORRIGIDA: busca todos os usuários, pois a consulta 'some' para Jsonb pode ser complexa
            where: {
                assignments: {
                    json_contains: {
                        path: '$[*].contractGroup',
                        string_value: oldName
                    }
                }
            }
        });

        const transactions = [
            prisma.location.updateMany({
                where: { contractGroup: oldName },
                data: { contractGroup: newName }
            }),
            prisma.contractConfig.updateMany({
                where: { contractGroup: oldName },
                data: { contractGroup: newName }
            }),
            prisma.serviceRecord.updateMany({
                where: { contractGroup: oldName },
                data: { contractGroup: newName }
            })
        ];

        for (const user of usersToUpdate) {
            const updatedAssignments = user.assignments.map(assignment => {
                if (assignment.contractGroup === oldName) {
                    return { ...assignment, contractGroup: newName };
                }
                return assignment;
            });

            transactions.push(
                prisma.user.update({
                    where: { id: user.id },
                    data: { assignments: updatedAssignments }
                })
            );
        }

        await prisma.$transaction(transactions);

        res.status(200).json({ message: `Grupo de contrato '${oldName}' renomeado para '${newName}' com sucesso.` });
    } catch (error) {
        console.error("Erro ao renomear o grupo de contrato:", error);
        res.status(500).json({ message: 'Erro ao renomear o grupo de contrato', error: error.message });
    }
});

// ROTA CORRIGIDA PARA EXCLUIR UM GRUPO DE CONTRATO
router.delete('/:name', protect, adminOnly, async (req, res) => {
    const { name } = req.params;
    const { password } = req.body;

    try {
        const user = await prisma.user.findFirst({
            where: { id: req.user.id },
        });

        if (!user || !await bcrypt.compare(password, user.passwordHash)) {
            return res.status(401).json({ message: 'Senha incorreta.' });
        }

        const serviceRecordsCount = await prisma.serviceRecord.count({
            where: { contractGroup: name }
        });

        if (serviceRecordsCount > 0) {
            return res.status(400).json({ message: `Não é possível excluir o contrato, pois ele possui ${serviceRecordsCount} registros de serviço associados.` });
        }

        const usersToUpdate = await prisma.user.findMany({
            // SINTAXE CORRIGIDA: usa a consulta JSON para Jsonb
            where: {
                assignments: {
                    json_contains: {
                        path: '$[*].contractGroup',
                        string_value: name
                    }
                }
            }
        });

        const transactions = [
            prisma.serviceRecord.deleteMany({
                 where: { contractGroup: name }
            }),
            prisma.location.deleteMany({
                where: { contractGroup: name }
            }),
            prisma.contractConfig.deleteMany({
                where: { contractGroup: name }
            }),
        ];

        for (const user of usersToUpdate) {
            const updatedAssignments = user.assignments.filter(assignment => assignment.contractGroup !== name);
            transactions.push(
                prisma.user.update({
                    where: { id: user.id },
                    data: { assignments: updatedAssignments }
                })
            );
        }

        await prisma.$transaction(transactions);

        res.status(200).json({ message: `Grupo de contrato '${name}' e seus locais foram excluídos com sucesso.` });
    } catch (error) {
        console.error("Erro ao excluir o grupo de contrato:", error);
        res.status(500).json({ message: 'Erro ao excluir o grupo de contrato', error: error.message });
    }
});

module.exports = router;
