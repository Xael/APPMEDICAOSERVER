require('dotenv').config();
const contractConfigRoutes = require('./routes/contractConfig.js');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const contractGroupsRouter = require('./routes/contractConfig');
const authRoutes = require('./routes/auth');
const recordRoutes = require('./routes/records');
const locationRoutes = require('./routes/locations');
const userRoutes = require('./routes/users');
const serviceRoutes = require('./routes/services');
const unitRoutes = require('./routes/units');
const goalRoutes = require('./routes/goals');
const auditLogRoutes = require('./routes/auditLog');
const reportRoutes = require('./routes/reports.js');

const app = express();
const PORT = process.env.PORT || 8000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.get('/api', (req, res) => {
  res.json({ message: 'CRB Serviços API is running!' });
});

app.use('/api/contract-groups', contractGroupsRouter);
app.use('/api/contract-configs', contractConfigRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/auditlog', auditLogRoutes);
app.use('/api/reports', reportRoutes);

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
