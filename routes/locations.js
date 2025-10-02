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
    // Mapeia os IDs de serviço para o formato que o frontend espera (service_ids)
    const formattedLocations = locations.map(loc => ({
        ...loc,
        service_ids: loc.services.map(s => s.id)
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
    const updatedLocation = await prisma.location.update({
      where: { id: parseInt(req.params.id) },
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
    res.json(updatedLocation);
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ message: 'Error updating location', error: error.message });
  }
});

// Delete a location
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await prisma.location.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting location:", error);
    res.status(500).json({ message: 'Error deleting location', error: error.message });
  }
});

module.exports = router;
