const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get all locations
router.get('/', protect, async (req, res) => {
  try {
    const locations = await prisma.location.findMany({ orderBy: { name: 'asc' } });
    res.json(locations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching locations', error: error.message });
  }
});

// Create a new location
router.post('/', protect, adminOnly, async (req, res) => {
  const { city, name, area, lat, lng } = req.body;
  try {
    const newLocation = await prisma.location.create({
      data: { city, name, area, lat, lng },
    });
    res.status(201).json(newLocation);
  } catch (error) {
    res.status(500).json({ message: 'Error creating location', error: error.message });
  }
});

// Update a location
router.put('/:id', protect, adminOnly, async (req, res) => {
  const { city, name, area, lat, lng } = req.body;
  try {
    const updatedLocation = await prisma.location.update({
      where: { id: parseInt(req.params.id) },
      data: { city, name, area, lat, lng },
    });
    res.json(updatedLocation);
  } catch (error) {
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
    res.status(500).json({ message: 'Error deleting location', error: error.message });
  }
});

module.exports = router;
