const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get all locations, INCLUDING their associated services
router.get('/', protect, async (req, res) => {
  try {
    const locations = await prisma.location.findMany({ 
      orderBy: { name: 'asc' },
      include: {
        services: true // Inclui os serviços relacionados
      }
    });
    // Mapeia os IDs de serviço para o formato que o frontend espera (serviceIds)
    const formattedLocations = locations.map(loc => ({
        ...loc,
        serviceIds: loc.services.map(s => String(s.id)) // Garante que IDs sejam strings no frontend
    }));
    res.json(formattedLocations);
  } catch (error) {
    console.error("Error fetching locations:", error.message);
    res.status(500).json({ message: 'Error fetching locations', error: error.message });
  }
});

// Create a new location
router.post('/', protect, adminOnly, async (req, res) => {
  const { city, name, area, lat, lng, service_ids } = req.body;
  try {
    const newLocation = await prisma.location.create({
      data: { 
        city, 
        name, 
        area, 
        lat, 
        lng,
        // =================================================================
        // LINHA DA CORREÇÃO: Conecta o local ao usuário logado (autor)
        // =================================================================
        author: {
            connect: { id: parseInt(req.user.id, 10) }
        },
        // Conecta os serviços selecionados ao novo local
        services: {
            connect: (service_ids || []).map((id) => ({ id: parseInt(id) }))
        }
      },
    });
    res.status(201).json(newLocation);
  } catch (error) {
    console.error("Error creating location:", error);
    res.status(500).json({ message: 'Error creating location', error: error.message });
  }
});


// Update a location
router.put('/:id', protect, adminOnly, async (req, res) => {
  const { city, name, area, lat, lng, service_ids } = req.body;
  try {
    const locationId = parseInt(req.params.id);
    const updatedLocation = await prisma.location.update({
      where: { id: locationId },
      data: { 
        city, 
        name, 
        area, 
        lat, 
        lng,
        // 'set' desconecta todos os serviços antigos e conecta apenas os novos
        services: {
            set: (service_ids || []).map((id) => ({ id: parseInt(id) }))
        }
      },
    });

    // Opcional, mas recomendado: Adicionar registro de auditoria para a atualização
    try {
        await prisma.auditLog.create({
            data: {
                adminId: parseInt(req.user.id, 10),
                adminUsername: req.user.name || 'Desconhecido',
                action: 'UPDATE',
                recordId: String(locationId), // AuditLog pode esperar string para IDs de diferentes tabelas
                details: `Local atualizado: "${name}" em ${city}.`,
            },
        });
    } catch (logErr) {
        console.error("Erro ao salvar audit log para atualização de local:", logErr.message);
    }

    res.json(updatedLocation);
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ message: 'Error updating location', error: error.message });
  }
});

// Delete a location
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const locationId = parseInt(req.params.id);

    // Adicionado: Buscar dados do local antes de deletar para usar no log
    const locationToDelete = await prisma.location.findUnique({
        where: { id: locationId },
    });

    if (!locationToDelete) {
        return res.status(404).json({ message: 'Location not found' });
    }

    await prisma.location.delete({
      where: { id: locationId },
    });

    // Adicionado: Registro de auditoria para a exclusão
     try {
        await prisma.auditLog.create({
            data: {
                adminId: parseInt(req.user.id, 10),
                adminUsername: req.user.name || 'Desconhecido',
                action: 'DELETE',
                recordId: String(locationId),
                details: `Local excluído: "${locationToDelete.name}" em ${locationToDelete.city}.`,
            },
        });
    } catch (logErr) {
        console.error("Erro ao salvar audit log para exclusão de local:", logErr.message);
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting location:", error);
    res.status(500).json({ message: 'Error deleting location', error: error.message });
  }
});

module.exports = router;
