require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Socket.io Setup
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for MVP
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

// Basic route
app.get('/', (req, res) => {
  res.send('Micro-Betting API is running');
});

// Socket.io Connection
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Import services
const simulator = require('./services/simulator');
const marketService = require('./services/marketService');

// Start services
marketService.setIo(io);
simulator.start(io, marketService);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
