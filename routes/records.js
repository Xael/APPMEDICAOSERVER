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
    
    // CORRIGIDO: Acesso seguro ao nome do operador para evitar erro 500
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
    const record = await prisma.record.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { operator: { select: { name: true } } },
    });
    if (!record) return res.status(404).json({ message: 'Record not found' });
    
    // CORRIGIDO: Acesso seguro ao nome do operador para evitar erro 500
    const formattedRecord = {
        ...record,
        operatorName: record.operator?.name || 'Operador Deletado'
    };

    res.json(formattedRecord);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching record', error: error.message });
  }
});

// SUBSTITUA TODA ESTA ROTA EM 'records.js'

router.post('/:id/photos', protect, upload.array('files'), async (req, res) => {
    const { phase } = req.body; // 'BEFORE' or 'AFTER'
    
    // ======== ADICIONADO: Validação do ID ========
    const recordId = parseInt(req.params.id, 10);
    if (isNaN(recordId)) {
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
        const record = await prisma.record.findUnique({ where: { id: recordId } }); // Usa a variável validada
        if (!record) {
            return res.status(404).json({ message: 'Record not found' });
        }

        const photoPaths = req.files.map(file => `/uploads/${file.filename}`);

        let updatedRecord;
        if (phase === 'BEFORE') {
            updatedRecord = await prisma.record.update({
                where: { id: recordId }, // Usa a variável validada
                data: { beforePhotos: { push: photoPaths } },
            });
        } else { // AFTER
            updatedRecord = await prisma.record.update({
                where: { id: recordId }, // Usa a variável validada
                data: { 
                    afterPhotos: { push: photoPaths },
                    endTime: new Date()
                },
            });
        }
        res.status(200).json(updatedRecord);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error uploading photos', error: error.message });
    }
});

// Rota para fazer upload de fotos para um registro
router.post('/:id/photos', protect, upload.array('files'), async (req, res) => {
  const { id } = req.params;
  const { phase } = req.body; // 'BEFORE' or 'AFTER'
  
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'No files uploaded.' });
  }

  if (!['BEFORE', 'AFTER'].includes(phase)) {
    return res.status(400).json({ message: 'Phase must be BEFORE or AFTER.' });
  }

  try {
    const record = await prisma.record.findUnique({ where: { id: parseInt(id) } });
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    const photoPaths = req.files.map(file => `/uploads/${file.filename}`);

    let updatedRecord;
    if (phase === 'BEFORE') {
      updatedRecord = await prisma.record.update({
        where: { id: parseInt(id) },
        data: { beforePhotos: { push: photoPaths } },
      });
    } else { // AFTER
      updatedRecord = await prisma.record.update({
        where: { id: parseInt(id) },
        data: { 
            afterPhotos: { push: photoPaths },
            endTime: new Date() // Define a data de fim ao enviar fotos "Depois"
        },
      });
    }
    res.status(200).json(updatedRecord);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error uploading photos', error: error.message });
  }
});

// Rota para atualizar um registro (Admin)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const recordId = parseInt(req.params.id, 10);
    const {
      locationName, serviceType, serviceUnit, locationArea,
      contractGroup, gpsUsed, startTime, endTime,
      beforePhotos, afterPhotos
    } = req.body;

    // ADICIONADO: Lógica para deletar arquivos de foto removidos
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
    // FIM DA ADIÇÃO

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
    const record = await prisma.record.findUnique({ where: { id: recordId } });

    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // Lógica para deletar arquivos de foto associados
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

    // Bloco do AuditLog CORRIGIDO
    try {
      await prisma.auditLog.create({
        data: {
          adminId: parseInt(req.user.id, 10), // GARANTE QUE SEJA NÚMERO
          adminUsername: req.user.name || 'Desconhecido',
          action: 'DELETE',
          recordId: recordId, // USA A VARIÁVEL QUE JÁ É NÚMERO
          details: `Registro excluído: ${record.serviceType || 'N/A'} em ${record.locationName || 'N/A'}, ${record.contractGroup || 'N/A'}.`,
        },
      });
    } catch (logErr) {
      console.error("Erro ao salvar audit log:", logErr.message);
      // Mesmo que o log falhe, a operação principal já foi concluída.
      // Você pode decidir se quer ou não retornar um erro aqui.
    }

    res.status(204).send();
  } catch (error) {
    console.error("Erro ao excluir registro:", error);
    res.status(500).json({ message: 'Error deleting record', error: error.message });
  }
});

module.exports = router;
