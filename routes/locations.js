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
      const { city, services, ...rest } = loc;
      return {
        ...rest,
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
router.post('/', protect, adminOnly, async (req, res) => {
  // O frontend agora envia 'services' com 'service_id' e 'measurement'
  const { city, name, lat, lng, services } = req.body;
  
  if (!Array.isArray(services)) {
    return res.status(400).json({ message: 'Services must be an array.' });
  }

  try {
    const newLocation = await prisma.location.create({
      data: {
        city,
        name,
        lat,
        lng,
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
  const { city, name, lat, lng, services } = req.body;
  const locationId = parseInt(req.params.id);

  if (!Array.isArray(services)) {
    return res.status(400).json({ message: 'Services must be an array.' });
  }

  try {
    // Transação para garantir consistência: deleta os antigos e cria os novos
    const transaction = await prisma.$transaction([
      // 1. Deleta todas as medições antigas para este local
      prisma.locationService.deleteMany({ where: { locationId: locationId } }),
      // 2. Atualiza os dados do local e cria as novas medições
      prisma.location.update({
        where: { id: locationId },
        data: {
          city,
          name,
          lat,
          lng,
          services: {
            create: services.map(s => ({
              measurement: parseFloat(s.measurement),
              service: { connect: { id: parseInt(s.service_id) } }
            }))
          }
        }
      })
    ]);
    
    res.json(transaction[1]); // Retorna o resultado da operação de update
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ message: 'Error updating location', error: error.message });
  }
});

// Delete a location
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const locationId = parseInt(req.params.id);
    // Graças ao 'onDelete: Cascade' no schema, deletar o local
    // irá deletar automaticamente as entradas em 'LocationService'
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
