const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get all goals
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const goals = await prisma.goal.findMany({ orderBy: { month: 'desc' } });
    res.json(goals);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching goals', error: error.message });
  }
});

// Create a new goal
router.post('/', protect, adminOnly, async (req, res) => {
  const { contractGroup, month, targetArea } = req.body;
  try {
    const newGoal = await prisma.goal.create({
      data: { contractGroup, month, targetArea },
    });
    res.status(201).json(newGoal);
  } catch (error) {
    res.status(500).json({ message: 'Error creating goal', error: error.message });
  }
});

// Update a goal
router.put('/:id', protect, adminOnly, async (req, res) => {
  const { contractGroup, month, targetArea } = req.body;
  try {
    const updatedGoal = await prisma.goal.update({
      where: { id: parseInt(req.params.id) },
      data: { contractGroup, month, targetArea },
    });
    res.json(updatedGoal);
  } catch (error) {
    res.status(500).json({ message: 'Error updating goal', error: error.message });
  }
});

// Delete a goal
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    await prisma.goal.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Error deleting goal', error: error.message });
  }
});

module.exports = router;
