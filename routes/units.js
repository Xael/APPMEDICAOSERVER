// ./routes/units.js

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get all units
router.get('/', protect, async (req, res) => {
  try {
    const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
    res.json(units);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching units', error: error.message });
  }
});

// Create a new unit
router.post('/', protect, adminOnly, async (req, res) => {
  const { name, symbol } = req.body;
  if (!name || !symbol) {
    return res.status(400).json({ message: 'Name and symbol are required' });
  }
  try {
    const newUnit = await prisma.unit.create({ data: { name, symbol } });
    res.status(201).json(newUnit);
  } catch (error) {
    res.status(500).json({ message: 'Error creating unit', error: error.message });
  }
});

// Update a unit
router.put('/:id', protect, adminOnly, async (req, res) => {
  const { name, symbol } = req.body;
  try {
    const updatedUnit = await prisma.unit.update({
      where: { id: parseInt(req.params.id) },
      data: { name, symbol },
    });
    res.json(updatedUnit);
  } catch (error) {
    res.status(500).json({ message: 'Error updating unit', error: error.message });
  }
});

// Delete a unit
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    // Adicionar verificação se a unidade está em uso
    const servicesUsingUnit = await prisma.service.count({
      where: { unitId: parseInt(req.params.id) },
    });
    if (servicesUsingUnit > 0) {
      return res.status(400).json({ message: 'Cannot delete unit as it is currently used by one or more services.' });
    }
    await prisma.unit.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting unit', error: error.message });
  }
});

module.exports = router;
