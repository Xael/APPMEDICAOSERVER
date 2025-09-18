const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const prisma = new PrismaClient();

// Multer storage configuration
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

// Get all records
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
        operatorName: r.operator.name
    }))

    res.json(formattedRecords);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching records', error: error.message });
  }
});

// Get single record
router.get('/:id', protect, async (req, res) => {
  try {
    const record = await prisma.record.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { operator: { select: { name: true } } },
    });
    if (!record) return res.status(404).json({ message: 'Record not found' });
    
    const formattedRecord = {
        ...record,
        operatorName: record.operator.name
    };

    res.json(formattedRecord);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching record', error: error.message });
  }
});

// Create a new record (initial step)
router.post('/', protect, async (req, res) => {
  const { operatorId, serviceType, serviceUnit, locationId, locationName, contractGroup, locationArea, gpsUsed, startTime } = req.body;
  try {
     const operator = await prisma.user.findUnique({ where: { id: parseInt(operatorId) }});
     if (!operator) return res.status(404).json({ message: "Operator not found" });

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
        location: locationId ? { connect: { id: parseInt(locationId) } } : undefined,
      },
    });
    res.status(201).json(newRecord);
  } catch (error) {
    res.status(500).json({ message: 'Error creating record', error: error.message });
  }
});

// Upload photos for a record
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
                data: { afterPhotos: { push: photoPaths } },
            });
        }
        res.status(200).json(updatedRecord);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error uploading photos', error: error.message });
    }
});

// Update a record (Admin can edit multiple fields)
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const {
      locationName,
      serviceType,
      serviceUnit,
      locationArea,
      contractGroup,
      gpsUsed,
      startTime,
      endTime,
    } = req.body;

    const updatedRecord = await prisma.record.update({
      where: { id: parseInt(req.params.id, 10) },
      data: {
        locationName,
        serviceType,
        serviceUnit,
        locationArea,
        contractGroup,
        gpsUsed,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
      },
    });

    res.json(updatedRecord);
  } catch (error) {
    console.error("Erro ao atualizar registro:", error);
    res.status(500).json({ message: 'Error updating record', error: error.message });
  }
});


// Delete a record
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const recordId = parseInt(req.params.id, 10);
    const record = await prisma.record.findUnique({ where: { id: recordId } });

    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }

    // Apaga primeiro
    await prisma.record.delete({ where: { id: recordId } });

    // Tenta registrar log, mas sem quebrar se algum campo vier null
    try {
      await prisma.auditLog.create({
        data: {
          adminId: String(req.user.id),
          adminUsername: req.user.name || 'Desconhecido',
          action: 'DELETE',
          recordId: String(recordId),
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

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting record', error: error.message });
  }
});

module.exports = router;
