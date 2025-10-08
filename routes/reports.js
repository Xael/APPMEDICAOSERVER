// Crie este novo arquivo: ./routes/reports.js

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');
const prisma = new PrismaClient();

// Rota para buscar dados para o gráfico de desempenho
router.get('/performance-graph', protect, async (req, res) => {
    try {
        const { startDate, endDate, contractGroups } = req.query;

        if (!startDate || !endDate || !contractGroups) {
            return res.status(400).json({ message: 'Parâmetros startDate, endDate e contractGroups são obrigatórios.' });
        }

        const groups = Array.isArray(contractGroups) ? contractGroups : [contractGroups];

        // 1. Busca os registros no banco de dados com os filtros aplicados
        const records = await prisma.record.findMany({
            where: {
                contractGroup: {
                    in: groups,
                },
                startTime: {
                    gte: new Date(startDate),
                    lte: new Date(endDate),
                },
                // Considera apenas registros com medição
                locationArea: {
                    gt: 0,
                },
            },
            select: {
                startTime: true,
                contractGroup: true,
                locationArea: true,
            },
            orderBy: {
                startTime: 'asc',
            },
        });

        // 2. Agrupa os dados em JavaScript
        const monthlyData = {}; // Estrutura: { "2025-09": { "CIDADE A": 1200, "CIDADE B": 1500 }, "2025-10": { ... } }
        
        for (const record of records) {
            const month = record.startTime.toISOString().substring(0, 7); // Formato "AAAA-MM"
            const group = record.contractGroup;

            if (!monthlyData[month]) {
                monthlyData[month] = {};
            }
            if (!monthlyData[month][group]) {
                monthlyData[month][group] = 0;
            }
            monthlyData[month][group] += record.locationArea;
        }

        // 3. Formata os dados para o Chart.js
        const labels = Object.keys(monthlyData).sort(); // Meses no eixo X
        const colors = ['#352f91', '#4a5568', '#28a745', '#dc3545', '#ffc107', '#17a2b8'];

        const datasets = groups.map((group, index) => ({
            label: group,
            data: labels.map(label => monthlyData[label]?.[group] || 0),
            backgroundColor: colors[index % colors.length] + '80', // Adiciona transparência
            borderColor: colors[index % colors.length],
            borderWidth: 1,
        }));

        res.json({ labels, datasets });

    } catch (error) {
        console.error("Erro ao gerar dados do gráfico:", error);
        res.status(500).json({ message: 'Erro interno ao processar dados do gráfico', error: error.message });
    }
});

module.exports = router;
