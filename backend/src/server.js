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

// Import services
const marketService = require('./services/marketService');
const realDataService = require('./services/realDataService');
const flashMarketService = require('./services/flashMarketService');

// Start services
marketService.setIo(io);
realDataService.setIo(io);
flashMarketService.setIo(io);

// Wire Services
// When RealDataService updates a match (via active monitoring), tell FlashMarketService to sync
// We need to inject a callback or event listener.
// Since we don't have an event bus, we can modify RealDataService to accept a listener or just quick-wire here if instances exposed events.
// For now, simpler to make RealDataService emit a local event or just call it directly if we had the instance.
// But they are singletons. Let's make RealDataService emit to internal listeners?
// Or better, let's pass FlashMarketService into RealDataService start method?
// Actually, RealDataService emits 'match_update' via socket. FlashMarketService can't easily listen to socket out of box server-side.
// Let's explicitly inject FlashService into RealDataService.
realDataService.setFlashService(flashMarketService);

// Endpoints
app.get('/', (req, res) => {
  res.send('Micro-Betting API is running');
});

app.get('/matches', (req, res) => {
  res.json(realDataService.getMatches());
});

// Socket.io Connection
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  socket.on('join_game', (fixtureId) => {
    console.log(`Client ${socket.id} joined game ${fixtureId}`);
    socket.join(`game_${fixtureId}`);
    realDataService.startMonitoring(fixtureId);

    // Also start Flash Markets if data is available
    const match = realDataService.getMatches().find(m => m.fixture.id === parseInt(fixtureId));
    if (match) {
        flashMarketService.startTracking(fixtureId, match);
    }
  });

  socket.on('leave_game', (fixtureId) => {
    console.log(`Client ${socket.id} left game ${fixtureId}`);
    socket.leave(`game_${fixtureId}`);
    realDataService.stopMonitoring(fixtureId);
    // flashMarketService.stopTracking(fixtureId); // Keep running for now or implement RefCount
  });

  socket.on('place_bet', (data) => {
    // Route bet to appropriate service based on ID format
    // Flash IDs look like "fixtureId_start_end" (e.g. "123_20_25")
    // Legacy IDs are simple numbers
    if (data.marketId && data.marketId.toString().includes('_')) {
        flashMarketService.placeBet(data, socket.id);
    } else {
        marketService.placeBet(data, socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
