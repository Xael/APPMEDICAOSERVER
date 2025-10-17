const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // Módulo para manipulação de arquivos
const prisma = new PrismaClient();

// Configuração do Multer (armazenamento de arquivos)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// Rota para buscar todos os registros
router.get('/', protect, async (req, res) => {
  try {
    const { operatorId } = req.query;
    const whereClause = operatorId ? { operatorId: parseInt(operatorId) } : {};
    
    const records = await prisma.record.findMany({
      where: whereClause,
      orderBy: { startTime: 'desc' },
      include: { operator: { select: { name: true } } },
    });
    
    const formattedRecords = records.map(r => ({
        ...r,
        operatorName: r.operator?.name || 'Operador Deletado'
    }));

    res.json(formattedRecords);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching records', error: error.message });
  }
});

// Rota para buscar um único registro
router.get('/:id', protect, async (req, res) => {
  try {
    const recordId = parseInt(req.params.id, 10);
    if (isNaN(recordId)) {
        return res.status(400).json({ message: 'ID de registro inválido.' });
    }

    const record = await prisma.record.findUnique({
      where: { id: recordId },
      include: { operator: { select: { name: true } } },
    });
    if (!record) return res.status(404).json({ message: 'Record not found' });
    
    const formattedRecord = {
        ...record,
        operatorName: record.operator?.name || 'Operador Deletado'
    };

    res.json(formattedRecord);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching record', error: error.message });
  }
});

// Rota para criar um novo registro
router.post('/', protect, async (req, res) => {
  // Pega todos os dados, incluindo o novo objeto 'newLocationInfo'
  const { 
    operatorId, serviceType, serviceUnit, locationName, 
    contractGroup, locationArea, gpsUsed, startTime, newLocationInfo 
  } = req.body;
  
  // Usa o locationId existente por padrão
  let finalLocationId = req.body.locationId;

  try {
    // 1. VERIFICA SE PRECISA CRIAR UM NOVO LOCAL
    if (newLocationInfo && newLocationInfo.name) {
      console.log('Recebido pedido para criar novo local:', newLocationInfo.name);
      try {
        const newLocation = await prisma.location.create({
          data: {
            city: newLocationInfo.city,
            name: newLocationInfo.name,
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
        finalLocationId = newLocation.id; // Guarda o ID do local recém-criado
        console.log('Novo local criado com ID:', finalLocationId);
      } catch (locError) {
        console.error("Falha ao criar o novo local automaticamente:", locError);
        // Se a criação do local falhar, o registro ainda será criado, mas sem um link de local.
      }
    }

    // 2. CRIA O REGISTRO DE SERVIÇO, USANDO O ID DO LOCAL (NOVO OU EXISTENTE)
    const operator = await prisma.user.findUnique({ where: { id: parseInt(operatorId) } });
    if (!operator) {
      return res.status(404).json({ message: "Operator not found" });
    }

    const newRecord = await prisma.record.create({
      data: {
        serviceType,
        serviceUnit,
        locationName,
        contractGroup,
        locationArea,
        gpsUsed,
        startTime: new Date(startTime),
        operator: { connect: { id: operator.id } },
        operatorName: operator.name,
        // Conecta o registro ao local, seja ele um que já existia ou o que acabamos de criar
        location: finalLocationId ? { connect: { id: parseInt(finalLocationId) } } : undefined,
      },
    });
    res.status(201).json(newRecord);

  } catch (error) {
    console.error("Error creating record:", error);
    res.status(500).json({ message: 'Error creating record', error: error.message });
  }
});
// Rota para fazer upload de fotos para um registro (CORRIGIDA)
router.post('/:id/photos', protect, upload.array('files'), async (req, res) => {
    const { phase } = req.body; // 'BEFORE' or 'AFTER'
    
    // ======== VALIDAÇÃO DO ID CORRIGIDA ========
    const recordId = parseInt(req.params.id, 10);
    if (isNaN(recordId)) {
        // Se o ID não for um número válido, retorna um erro claro.
        return res.status(400).json({ message: 'ID de registro inválido.' });
    }
    // ===========================================

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded.' });
    }

    if (!['BEFORE', 'AFTER'].includes(phase)) {
        return res.status(400).json({ message: 'Phase must be BEFORE or AFTER.' });
    }

    try {
        // Agora, usa a variável `recordId` que já foi validada e convertida
        const record = await prisma.record.findUnique({ where: { id: recordId } });
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }

        const photoPaths = req.files.map(file => `/uploads/${file.filename}`);

        let updatedRecord;
        if (phase === 'BEFORE') {
            updatedRecord = await prisma.record.update({
                where: { id: recordId },
                data: { beforePhotos: { push: photoPaths } },
            });
        } else { // AFTER
            updatedRecord = await prisma.record.update({
                where: { id: recordId },
                data: { 
                    afterPhotos: { push: photoPaths },
                    endTime: new Date()
                },
            });
        }
        res.status(200).json(updatedRecord);
    } catch (error) {
        console.error("Error uploading photos:", error);
        res.status(500).json({ message: 'Error uploading photos', error: error.message });
    }
});


// Rota para atualizar um registro (Admin)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const recordId = parseInt(req.params.id, 10);
    if (isNaN(recordId)) {
      return res.status(400).json({ message: 'ID de registro inválido.' });
    }
    const {
      locationName, serviceType, serviceUnit, locationArea,
      contractGroup, gpsUsed, startTime, endTime,
      beforePhotos, afterPhotos
    } = req.body;

    const currentRecord = await prisma.record.findUnique({ where: { id: recordId } });
    if (!currentRecord) {
        return res.status(404).json({ message: 'Record not found' });
    }
    
    const oldPhotos = [...currentRecord.beforePhotos, ...currentRecord.afterPhotos];
    const newPhotos = new Set([...(beforePhotos || []), ...(afterPhotos || [])]);
    const photosToDelete = oldPhotos.filter(p => !newPhotos.has(p));

    for (const photoPath of photosToDelete) {
        try {
            const fullPath = path.join(__dirname, '..', photoPath);
            await fs.unlink(fullPath);
        } catch (fileErr) {
            console.error(`Falha ao deletar arquivo removido ${photoPath}:`, fileErr.message);
        }
    }

    const updatedRecord = await prisma.record.update({
      where: { id: recordId },
      data: {
        locationName, serviceType, serviceUnit, locationArea,
        contractGroup, gpsUsed,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        beforePhotos: beforePhotos ?? undefined,
        afterPhotos: afterPhotos ?? undefined,
      },
    });

    res.json(updatedRecord);
  } catch (error) {
    console.error("Erro ao atualizar registro:", error);
    res.status(500).json({ message: 'Error updating record', error: error.message });
  }
});

// Rota para deletar um registro
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const recordId = parseInt(req.params.id, 10);
    if (isNaN(recordId)) {
        return res.status(400).json({ message: 'ID de registro inválido.' });
    }
    const record = await prisma.record.findUnique({ where: { id: recordId } });

    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const photosToDelete = [...record.beforePhotos, ...record.afterPhotos];
    for (const photoPath of photosToDelete) {
      try {
        const fullPath = path.join(__dirname, '..', photoPath);
        await fs.unlink(fullPath);
      } catch (fileErr) {
        console.error(`Falha ao deletar arquivo ${photoPath}:`, fileErr.message);
      }
    }

    await prisma.record.delete({ where: { id: recordId } });

    try {
      await prisma.auditLog.create({
        data: {
          adminId: parseInt(req.user.id, 10),
          adminUsername: req.user.name || 'Desconhecido',
          action: 'DELETE',
          recordId: recordId,
          details: `Registro excluído: ${record.serviceType || 'N/A'} em ${record.locationName || 'N/A'}, ${record.contractGroup || 'N/A'}.`,
        },
      });
    } catch (logErr) {
      console.error("Erro ao salvar audit log:", logErr.message);
    }

    res.status(204).send();
  } catch (error) {
    console.error("Erro ao excluir registro:", error);
    res.status(500).json({ message: 'Error deleting record', error: error.message });
  }
});

// Adicione ao final de routes/records.js

// Rota para ADM ajustar a medição de um registro
router.put('/:id/measurement', protect, adminOnly, async (req, res) => {
  const recordId = parseInt(req.params.id);
  const { overrideMeasurement } = req.body;

  if (overrideMeasurement === undefined) {
    return res.status(400).json({ message: 'Medição ajustada é obrigatória.' });
  }

  // Converte para número ou null se estiver vazio
  const valueToSave = overrideMeasurement === '' || overrideMeasurement === null ? null : parseFloat(overrideMeasurement);

  try {
    const updatedRecord = await prisma.record.update({
      where: { id: recordId },
      data: {
        overrideMeasurement: valueToSave
      },
    });

    // Opcional: Adicionar ao log de auditoria
    await prisma.auditLog.create({
      data: {
        adminId: req.user.id,
        adminUsername: req.user.name,
        action: 'ADJUST_MEASUREMENT',
        recordId: recordId,
        details: `Medição ajustada para ${valueToSave === null ? 'padrão' : valueToSave}. Valor original: ${updatedRecord.locationArea}.`,
      },
    });

    res.json(updatedRecord);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar a medição.', error: error.message });
  }
});

module.exports = router;
