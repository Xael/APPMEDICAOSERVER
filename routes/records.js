const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const prisma = new PrismaClient();

// --- Configuração do Multer ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage });

// ==========================================================
// 📄 GET / - Rota para buscar todos os registros (CORRIGIDA)
// ==========================================================
router.get('/', protect, async (req, res) => {
  try {
    const records = await prisma.record.findMany({
      orderBy: { startTime: 'desc' },
      include: {
        // A busca pelo operador foi removida para evitar erros.
        // Usaremos o `operatorName` que já está salvo no registro.
        location: { select: { observations: true } },
      },
    });

    const formattedRecords = records.map(r => {
        const { location, ...rest } = r;
        return {
            ...rest,
            // Garante que o nome do operador sempre exista.
            operatorName: r.operatorName || 'Operador Deletado',
            observations: location?.observations || null,
        };
    });

    res.json(formattedRecords);
  } catch (error) {
    console.error("Erro ao buscar registros:", error);
    res.status(500).json({ message: 'Erro ao buscar registros', error: error.message });
  }
});

// ==========================================================
// 📄 GET /:id - Rota para buscar um único registro (CORRIGIDA)
// ==========================================================
router.get('/:id', protect, async (req, res) => {
    try {
        const recordId = parseInt(req.params.id, 10);
        if (isNaN(recordId)) {
            return res.status(400).json({ message: 'ID de registro inválido.' });
        }

        const record = await prisma.record.findUnique({
            where: { id: recordId },
            include: {
                location: { select: { observations: true } },
            },
        });

        if (!record) {
            return res.status(404).json({ message: 'Registro não encontrado' });
        }

        const { location, ...rest } = record;
        const formattedRecord = {
            ...rest,
            operatorName: record.operatorName || 'Operador Deletado',
            observations: location?.observations || null,
        };

        res.json(formattedRecord);
    } catch (error) {
        console.error("Erro ao buscar registro:", error);
        res.status(500).json({ message: 'Erro ao buscar registro', error: error.message });
    }
});


// ==========================================================
// ➕ POST / - Rota para CRIAR um novo registro
// ==========================================================
router.post('/', protect, async (req, res) => {
    const {
        operatorId, serviceType, serviceUnit, locationName, contractGroup,
        locationArea, gpsUsed, startTime, newLocationInfo, serviceId
    } = req.body;
    let finalLocationId = req.body.locationId;

    if (!serviceId) {
        return res.status(400).json({ message: "O 'serviceId' é obrigatório." });
    }

    try {
        const operator = await prisma.user.findUnique({ where: { id: parseInt(operatorId) } });
        if (!operator) {
            return res.status(404).json({ message: "Operador não encontrado" });
        }

        if (newLocationInfo && newLocationInfo.name) {
            const newLocation = await prisma.location.create({
                data: {
                    city: newLocationInfo.city,
                    name: newLocationInfo.name,
                    observations: newLocationInfo.observations || '',
                    lat: newLocationInfo.lat,
                    lng: newLocationInfo.lng,
                    services: {
                        create: (newLocationInfo.services || []).map(s => ({
                            measurement: parseFloat(s.measurement),
                            service: { connect: { id: parseInt(s.service_id) } }
                        }))
                    }
                }
            });
            finalLocationId = newLocation.id;
        }

        const newRecord = await prisma.record.create({
            data: {
                serviceType, serviceUnit, locationName, contractGroup,
                locationArea: parseFloat(locationArea),
                gpsUsed: Boolean(gpsUsed),
                startTime: new Date(startTime),
                operatorName: operator.name, // Salva o nome para referência futura
                operator: { connect: { id: operator.id } },
                location: finalLocationId ? { connect: { id: parseInt(finalLocationId) } } : undefined,
                serviceId: parseInt(serviceId),
            },
        });

        res.status(201).json(newRecord);

    } catch (error) {
        console.error("Erro ao criar registro:", error);
        res.status(500).json({ message: 'Erro ao criar registro', error: error.message });
    }
});

// ==========================================================
// 📸 POST /:id/photos - Rota para UPLOAD de fotos (MELHORADA)
// ==========================================================
router.post('/:id/photos', protect, upload.array('files'), async (req, res) => {
    const { phase } = req.body;
    const recordId = parseInt(req.params.id, 10);

    if (isNaN(recordId) || !req.files || req.files.length === 0 || !['BEFORE', 'AFTER'].includes(phase)) {
        return res.status(400).json({ message: 'Dados inválidos para upload de fotos.' });
    }

    try {
        const record = await prisma.record.findUnique({ where: { id: recordId } });
        if (!record) {
            // Se o registro não for encontrado, deleta os arquivos que foram enviados
            req.files.forEach(file => fs.unlink(file.path).catch(err => console.error("Erro ao limpar arquivo órfão:", err)));
            return res.status(404).json({ message: 'Registro não encontrado para associar fotos.' });
        }

        const photoPaths = req.files.map(file => `/uploads/${file.filename}`);

        // Lógica mais segura: busca o array existente, adiciona os novos e salva.
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
// ✏️ PUT /:id - Rota para ATUALIZAR um registro (Admin)
// ==========================================================
router.put('/:id', protect, adminOnly, async (req, res) => {
    try {
        const recordId = parseInt(req.params.id, 10);
        if (isNaN(recordId)) return res.status(400).json({ message: 'ID de registro inválido.' });

        const { beforePhotos, afterPhotos, ...dataToUpdate } = req.body;

        const updatedRecord = await prisma.record.update({
            where: { id: recordId },
            data: {
                ...dataToUpdate,
                startTime: dataToUpdate.startTime ? new Date(dataToUpdate.startTime) : undefined,
                endTime: dataToUpdate.endTime ? new Date(dataToUpdate.endTime) : undefined,
                beforePhotos: beforePhotos,
                afterPhotos: afterPhotos,
            },
        });

        res.json(updatedRecord);
    } catch (error) {
        console.error("Erro ao atualizar registro:", error);
        res.status(500).json({ message: 'Erro ao atualizar registro', error: error.message });
    }
});

// ==========================================================
// 📏 PUT /:id/measurement - Rota para AJUSTAR MEDIÇÃO (Admin)
// ==========================================================
router.put('/:id/measurement', protect, adminOnly, async (req, res) => {
    try {
        const recordId = parseInt(req.params.id);
        const { overrideMeasurement } = req.body;
        if (overrideMeasurement === undefined) {
            return res.status(400).json({ message: 'Medição ajustada é obrigatória.' });
        }

        const valueToSave = overrideMeasurement === '' || overrideMeasurement === null ? null : parseFloat(overrideMeasurement);

        const updatedRecord = await prisma.record.update({
            where: { id: recordId },
            data: { overrideMeasurement: valueToSave },
        });

        res.json(updatedRecord);
    } catch (error) {
        console.error("Erro ao atualizar medição:", error);
        res.status(500).json({ message: 'Erro ao atualizar a medição.', error: error.message });
    }
});


// ==========================================================
// ❌ DELETE /:id - Rota para DELETAR um registro (Admin)
// ==========================================================
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const recordId = parseInt(req.params.id, 10);
        if (isNaN(recordId)) return res.status(400).json({ message: 'ID de registro inválido.' });

        const record = await prisma.record.findUnique({ where: { id: recordId } });
        if (!record) return res.status(404).json({ message: 'Registro não encontrado' });

        const photosToDelete = [...record.beforePhotos, ...record.afterPhotos];
        for (const photoPath of photosToDelete) {
            try {
                await fs.unlink(path.join(__dirname, '..', photoPath));
            } catch (fileErr) {
                console.error(`Falha ao deletar arquivo ${photoPath}:`, fileErr.message);
            }
        }

        await prisma.record.delete({ where: { id: recordId } });

        res.status(204).send();
    } catch (error) {
        console.error("Erro ao excluir registro:", error);
        res.status(500).json({ message: 'Erro ao excluir registro', error: error.message });
    }
});

module.exports = router;
