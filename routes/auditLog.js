const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { protect, adminOnly } = require('../middleware/auth');
const prisma = new PrismaClient();

// Get all audit log entries
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const auditLogs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
    });
    res.json(auditLogs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching audit logs', error: error.message });
  }
});

module.exports = router;
