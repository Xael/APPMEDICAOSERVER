const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const prisma = new PrismaClient();

// Função auxiliar para criar logs de auditoria
const createAuditLog = async (adminId, adminUsername, action, recordId, details) => {
  try {
    await prisma.auditLog.create({
      data: {
        adminId,
        adminUsername,
        action,
        recordId: recordId ? parseInt(recordId) : undefined,
        details,
      },
    });
  } catch (error) {
    console.error('Falha ao criar entrada no log de auditoria:', error);
  }
};


// --- Configuração do Multer (sem alterações) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage });

// As rotas GET e POST permanecem as mesmas que corrigimos anteriormente...

// ==========================================================
// 📄 GET / - Rota para buscar todos os registros
// ==========================================================
router.get('/', protect, async (req, res) => {
  try {
    const records = await prisma.record.findMany({
      orderBy: { startTime: 'desc' },
      include: { location: { select: { observations: true } } },
    });
    const formattedRecords = records.map(r => {
        const { location, ...rest } = r;
        return { ...rest, operatorName: r.operatorName || 'Operador Deletado', observations: location?.observations || null };
    });
    res.json(formattedRecords);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar registros', error: error.message });
  }
});

// ==========================================================
// 📄 GET /:id - Rota para buscar um único registro
// ==========================================================
router.get('/:id', protect, async (req, res) => {
    try {
        const recordId = parseInt(req.params.id, 10);
        if (isNaN(recordId)) return res.status(400).json({ message: 'ID de registro inválido.' });
        const record = await prisma.record.findUnique({ where: { id: recordId }, include: { location: { select: { observations: true } } } });
        if (!record) return res.status(404).json({ message: 'Registro não encontrado' });
        const { location, ...rest } = record;
        const formattedRecord = { ...rest, operatorName: record.operatorName || 'Operador Deletado', observations: location?.observations || null };
        res.json(formattedRecord);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar registro', error: error.message });
    }
});

// ==========================================================
// ➕ POST / - Rota para CRIAR um novo registro
// ==========================================================
router.post('/', protect, async (req, res) => {
    const {
        operatorId, serviceType, serviceUnit, locationName, contractGroup,
        locationArea, gpsUsed, startTime, newLocationInfo, serviceId, serviceOrderNumber
    } = req.body;
    let finalLocationId = req.body.locationId;
    if (!serviceId || !operatorId) return res.status(400).json({ message: "Os campos 'serviceId' e 'operatorId' são obrigatórios." });
    try {
        const operator = await prisma.user.findUnique({ where: { id: parseInt(operatorId) } });
        if (!operator) return res.status(404).json({ message: "Operador não encontrado" });
        if (newLocationInfo && newLocationInfo.name) {
            const newLocation = await prisma.location.create({ data: { city: newLocationInfo.city, name: newLocationInfo.name, observations: newLocationInfo.observations || '', lat: newLocationInfo.lat, lng: newLocationInfo.lng, services: { create: (newLocationInfo.services || []).map(s => ({ measurement: parseFloat(s.measurement), service: { connect: { id: parseInt(s.service_id) } } })) } } });
            finalLocationId = newLocation.id;
        }
        if (finalLocationId) {
            const locationExists = await prisma.location.findUnique({ where: { id: parseInt(finalLocationId) } });
            if (!locationExists) return res.status(404).json({ message: `Erro de sincronização: O local com ID ${finalLocationId} não foi encontrado.` });
        }
        const newRecord = await prisma.record.create({ 
            data: { 
                serviceType, 
                serviceUnit, 
                locationName, 
                contractGroup, 
                locationArea: parseFloat(locationArea), 
                gpsUsed: Boolean(gpsUsed), 
                startTime: new Date(startTime),
                serviceOrderNumber, 
                operatorName: operator.name, 
                operator: { connect: { id: operator.id } }, 
                location: finalLocationId ? { connect: { id: parseInt(finalLocationId) } } : undefined, 
                serviceId: parseInt(serviceId) 
            } 
        });
        res.status(201).json(newRecord);
    } catch (error) {
        if (error.code === 'P2025') return res.status(404).json({ message: 'Erro: Um dos registros relacionados não foi encontrado.', details: error.meta.cause });
        res.status(500).json({ message: 'Erro interno ao criar registro', error: error.message });
    }
});

// ==========================================================
// 📸 POST /:id/photos - Rota para UPLOAD de fotos (VERSÃO CORRIGIDA)
// ==========================================================
router.post('/:id/photos', protect, upload.array('files'), async (req, res) => {
    const { phase } = req.body;
    const recordIdOrTempId = req.params.id; // Aceita tanto o ID final quanto o temporário

    if (!req.files || req.files.length === 0 || !['BEFORE', 'AFTER'].includes(phase)) {
        return res.status(400).json({ message: 'Dados inválidos para upload de fotos.' });
    }

    try {
        const recordId = parseInt(recordIdOrTempId, 10);

        // Se o ID não for um número, significa que é um ID temporário do syncManager.
        // O app está offline e vai tentar sincronizar mais tarde.
        if (isNaN(recordId)) {
            // Apenas confirmamos o recebimento. O syncManager cuidará do resto.
            return res.status(200).json({ message: "Upload recebido para ID temporário, aguardando ID final." });
        }

        const record = await prisma.record.findUnique({ where: { id: recordId } });
        if (!record) {
            // Se o registro não for encontrado, deleta os arquivos órfãos que foram enviados
            req.files.forEach(file => fs.unlink(file.path).catch(err => console.error("Erro ao limpar arquivo órfão:", err)));
            return res.status(404).json({ message: 'Registro não encontrado para associar fotos.' });
        }

        const photoPaths = req.files.map(file => `/uploads/${file.filename}`);

        // Lógica segura para adicionar fotos ao array existente
        const dataToUpdate = phase === 'BEFORE'
            ? { beforePhotos: [...record.beforePhotos, ...photoPaths] }
            : { afterPhotos: [...record.afterPhotos, ...photoPaths], endTime: new Date() };

        const updatedRecord = await prisma.record.update({
            where: { id: recordId },
            data: dataToUpdate,
        });

        res.status(200).json(updatedRecord);
    } catch (error) {
        console.error("Erro no upload de fotos:", error);
        res.status(500).json({ message: 'Erro no upload de fotos', error: error.message });
    }
});

// ==========================================================
// ✏️ PUT /:id - Rota para ATUALIZAR um registro (COM AUDITORIA)
// ==========================================================
router.put('/:id', protect, adminOnly, async (req, res) => {
    try {
        const recordId = parseInt(req.params.id, 10);
        if (isNaN(recordId)) return res.status(400).json({ message: 'ID de registro inválido.' });

        const originalRecord = await prisma.record.findUnique({ where: { id: recordId } });
        if (!originalRecord) return res.status(404).json({ message: 'Registro original não encontrado.' });
        
        const { beforePhotos, afterPhotos, serviceOrderNumber, ...dataToUpdate } = req.body;
        const updatedRecord = await prisma.record.update({
            where: { id: recordId },
            data: { ...dataToUpdate, serviceOrderNumber, startTime: dataToUpdate.startTime ? new Date(dataToUpdate.startTime) : undefined, endTime: dataToUpdate.endTime ? new Date(dataToUpdate.endTime) : undefined, beforePhotos, afterPhotos },
        });

        // <-- INÍCIO DA AUDITORIA -->
        const changes = Object.keys(dataToUpdate).map(key => {
            if (originalRecord[key] !== updatedRecord[key]) {
                return `${key} de '${originalRecord[key]}' para '${updatedRecord[key]}'`;
            }
            return null;
        }).filter(Boolean).join('; ');
        
        if (changes) {
            await createAuditLog(req.user.id, req.user.name, 'UPDATE', recordId, `Alterações no registro: ${changes}`);
        }
        // <-- FIM DA AUDITORIA -->

        res.json(updatedRecord);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar registro', error: error.message });
    }
});

// ==========================================================
// 📏 PUT /:id/measurement - Rota para AJUSTAR MEDIÇÃO (COM AUDITORIA)
// ==========================================================
router.put('/:id/measurement', protect, adminOnly, async (req, res) => {
    try {
        const recordId = parseInt(req.params.id);
        const { overrideMeasurement } = req.body;
        if (overrideMeasurement === undefined) return res.status(400).json({ message: 'Medição ajustada é obrigatória.' });
        
        const originalRecord = await prisma.record.findUnique({ where: { id: recordId } });
        if (!originalRecord) return res.status(404).json({ message: 'Registro original não encontrado.' });
        
        const valueToSave = overrideMeasurement === '' || overrideMeasurement === null ? null : parseFloat(overrideMeasurement);
        const updatedRecord = await prisma.record.update({ where: { id: recordId }, data: { overrideMeasurement: valueToSave } });

        // <-- INÍCIO DA AUDITORIA -->
        const originalValue = originalRecord.overrideMeasurement ?? originalRecord.locationArea;
        await createAuditLog(
            req.user.id,
            req.user.name,
            'ADJUST_MEASUREMENT',
            recordId,
            `Medição ajustada de '${originalValue}' para '${valueToSave}' no local '${originalRecord.locationName}'`
        );
        // <-- FIM DA AUDITORIA -->

        res.json(updatedRecord);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar a medição.', error: error.message });
    }
});

// ==========================================================
// ❌ DELETE /:id - Rota para DELETAR um registro (COM AUDITORIA)
// ==========================================================
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const recordId = parseInt(req.params.id, 10);
        if (isNaN(recordId)) return res.status(400).json({ message: 'ID de registro inválido.' });

        const record = await prisma.record.findUnique({ where: { id: recordId } });
        if (!record) return res.status(404).json({ message: 'Registro não encontrado' });

        const photosToDelete = [...record.beforePhotos, ...record.afterPhotos];
        for (const photoPath of photosToDelete) {
            try { await fs.unlink(path.join(__dirname, '..', photoPath)); }
            catch (fileErr) { console.error(`Falha ao deletar arquivo ${photoPath}:`, fileErr.message); }
        }

        await prisma.record.delete({ where: { id: recordId } });

        // <-- INÍCIO DA AUDITORIA -->
        await createAuditLog(
            req.user.id,
            req.user.name,
            'DELETE',
            recordId,
            `Registro do serviço '${record.serviceType}' no local '${record.locationName}' (Data: ${record.startTime.toISOString().split('T')[0]}) foi excluído.`
        );
        // <-- FIM DA AUDITORIA -->

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Erro ao excluir registro', error: error.message });
    }
});

module.exports = router;
