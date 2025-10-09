// Em /routes/reports.js

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');
const prisma = new PrismaClient();

router.get('/performance-graph', protect, async (req, res) => {
    try {
        const { startDate, endDate, contractGroups } = req.query;

        if (!startDate || !endDate || !contractGroups) {
            return res.status(400).json({ message: 'Parâmetros obrigatórios faltando.' });
        }

        console.log(`Buscando dados do gráfico: De ${startDate} a ${endDate} para os grupos:`, contractGroups);

        const groups = Array.isArray(contractGroups) ? contractGroups : [contractGroups];
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Garante que o dia final seja incluído por completo

        const records = await prisma.record.findMany({
            where: {
                contractGroup: { in: groups },
                startTime: { gte: start, lte: end },
                locationArea: { gt: 0 },
            },
            select: {
                startTime: true,
                contractGroup: true,
                locationArea: true,
            },
        });

        console.log(`Encontrados ${records.length} registros no banco de dados.`);

        const monthlyData = {};
        for (const record of records) {
            const month = record.startTime.toISOString().substring(0, 7); // "AAAA-MM"
            if (!monthlyData[month]) monthlyData[month] = {};
            if (!monthlyData[month][record.contractGroup]) monthlyData[month][record.contractGroup] = 0;
            monthlyData[month][record.contractGroup] += record.locationArea;
        }

        // --- LÓGICA MELHORADA PARA GERAR TODOS OS MESES ---
        const labels = [];
        let currentDate = new Date(start);
        while (currentDate <= end) {
            const monthLabel = currentDate.toISOString().substring(0, 7);
            if (!labels.includes(monthLabel)) {
                labels.push(monthLabel);
            }
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        labels.sort();
        // --- FIM DA LÓGICA MELHORADA ---

        console.log("Meses a serem exibidos (Eixo X):", labels);
        console.log("Dados agregados:", JSON.stringify(monthlyData, null, 2));

        const colors = ['#352f91', '#4a5568', '#28a745', '#dc3545', '#ffc107', '#17a2b8'];

        const datasets = groups.map((group, index) => ({
            label: group,
            data: labels.map(label => monthlyData[label]?.[group] || 0),
            backgroundColor: colors[index % colors.length] + '80',
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
