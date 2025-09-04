require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const recordRoutes = require('./routes/records');
const locationRoutes = require('./routes/locations');
const userRoutes = require('./routes/users');
const serviceRoutes = require('./routes/services');
const goalRoutes = require('./routes/goals');
const auditLogRoutes = require('./routes/auditLog');

const app = express();
const PORT = process.env.PORT || 8000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Middlewares
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.get('/api', (req, res) => {
  res.json({ message: 'CRB Serviços API is running!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/audit-log', auditLogRoutes);

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
