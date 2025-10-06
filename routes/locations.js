const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get all locations
router.get('/', protect, async (req, res) => {
  try {
    const locations = await prisma.location.findMany({ 
      orderBy: { name: 'asc' },
      include: {
        services: true
      }
    });

    // =================================================================
    // CORREÇÃO FINAL: Renomeando 'city' para 'contractGroup'
    // =================================================================
    const formattedLocations = locations.map(loc => {
      // Pega o campo 'city' e todo o resto do objeto 'loc'
      const { city, ...rest } = loc; 
      
      // Retorna um novo objeto com todos os dados, mas agora com 'contractGroup' em vez de 'city'
      return {
        ...rest,
        contractGroup: city, // <-- A TRADUÇÃO ACONTECE AQUI
        serviceIds: loc.services.map(s => String(s.id))
      };
    });

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
    const serviceIdsAsNumbers = (service_ids || [])
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));

    const newLocation = await prisma.location.create({
      data: { 
        city, 
        name, 
        area, 
        lat, 
        lng,
        services: {
            connect: serviceIdsAsNumbers.map(id => ({ id }))
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

    const serviceIdsAsNumbers = (service_ids || [])
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));

    const updatedLocation = await prisma.location.update({
      where: { id: locationId },
      data: { 
        city, 
        name, 
        area, 
        lat, 
        lng,
        services: {
            set: serviceIdsAsNumbers.map(id => ({ id }))
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
    const locationId = parseInt(req.params.id);
    await prisma.location.delete({
      where: { id: locationId },
    });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting location:", error);
    res.status(500).json({ message: 'Error deleting location', error: error.message });
  }
});

module.exports = router;
