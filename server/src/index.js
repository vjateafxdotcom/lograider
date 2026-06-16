const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const pool = require('./db/connection');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const teamRoutes = require('./routes/teams');
const logRoutes = require('./routes/logs');
const WebSocketManager = require('./websocket');

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes(pool));
app.use('/api/admin', adminRoutes(pool));
app.use('/api/teams', teamRoutes(pool));
app.use('/api/logs', logRoutes(pool));

// Admin Portal (static files under /lradmin)
app.use('/lradmin', express.static(path.join(__dirname, 'lradmin')));
app.get('/lradmin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'lradmin', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`LogRaider server listening on port ${PORT}`);
});

// WebSocket
const wss = new WebSocketManager(server, pool);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    pool.end();
    wss.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    pool.end();
    wss.close();
    process.exit(0);
  });
});

module.exports = app;
