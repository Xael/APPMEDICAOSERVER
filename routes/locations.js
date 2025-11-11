// ./routes/locations.js

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
        services: { // Inclui os dados da tabela de junção
          include: {
            service: { // Inclui os dados do serviço relacionado
              include: {
                unit: true // E também os dados da unidade
              }
            }
          }
        }
      }
    });

    // Formata a resposta para o frontend
    const formattedLocations = locations.map(loc => {
      const { city, services, parentId, isGroup, ...rest } = loc;
      return {
        ...rest,
        parentId,
        isGroup,
        contractGroup: city,
        // Agora 'services' é um array de objetos com todos os detalhes
        services: services.map(ls => ({
          serviceId: ls.serviceId,
          name: ls.service.name,
          measurement: ls.measurement,
          unit: ls.service.unit,
        }))
      };
    });

    res.json(formattedLocations);
  } catch (error) {
    console.error("Error fetching locations:", error.message);
    res.status(500).json({ message: 'Error fetching locations', error: error.message });
  }
});

// Create a new location
router.post('/', protect, async (req, res) => {
  const { city, name, lat, lng, services, parentId, observations, isGroup } = req.body;
  
  if (!Array.isArray(services)) {
    return res.status(400).json({ message: 'Services must be an array.' });
  }

  try {
    const newLocation = await prisma.location.create({
      data: {
        city,
        name,
        observations,
        lat,
        lng,
        isGroup: isGroup === true, // Garante que seja um booleano
        parentId: parentId ? parseInt(parentId, 10) : null,
        services: {
          create: services.map(s => ({
            measurement: parseFloat(s.measurement),
            service: { connect: { id: parseInt(s.service_id) } }
          }))
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
  const { city, name, lat, lng, services, parentId, observations, isGroup } = req.body;
  const locationId = parseInt(req.params.id);

  if (!Array.isArray(services)) {
    return res.status(400).json({ message: 'Services must be an array.' });
  }

  try {
    const updateData = {
        city,
        name,
        observations,
        lat,
        lng,
        parentId: parentId ? parseInt(parentId, 10) : null,
    };

    // Apenas inclui `isGroup` no objeto de atualização se for um booleano.
    // Isso evita que o campo seja acidentalmente setado para null se não for enviado.
    if (typeof isGroup === 'boolean') {
        updateData.isGroup = isGroup;
    }

    const transaction = await prisma.$transaction([
      prisma.locationService.deleteMany({ where: { locationId: locationId } }),
      prisma.location.update({
        where: { id: locationId },
        data: {
          ...updateData,
          services: {
            create: services.map(s => ({
              measurement: parseFloat(s.measurement),
              service: { connect: { id: parseInt(s.service_id) } }
            }))
          }
        }
      })
    ]);
    
    res.json(transaction[1]);
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
     if (error.code === 'P2003') { 
      return res.status(400).json({ message: 'Não é possível excluir este local pois ele possui registros de serviço ou ruas associadas.' });
    }
    res.status(500).json({ message: 'Error deleting location', error: error.message });
  }
});


module.exports = router;
