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
const betService = require('./services/betService');

// Mock Database (Single User for MVP)
const usersDb = { "user_1": { balance: 1000.00 } };

// Start services
marketService.setIo(io);
realDataService.setIo(io);
flashMarketService.setIo(io);
betService.setIo(io);
betService.setUsersDb(usersDb); // Inject DB into BetService for settlements

// Wire Services
realDataService.setFlashService(flashMarketService);
realDataService.setBetService(betService);

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

  // Auto-login for MVP
  const userId = "user_1";
  socket.userId = userId;

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  socket.on('join_game', (fixtureId) => {
    console.log(`Client ${socket.id} joined game ${fixtureId}`);
    socket.join(`game_${fixtureId}`);
    realDataService.startMonitoring(fixtureId);

    const match = realDataService.getMatches().find(m => m.fixture.id === parseInt(fixtureId));
    if (match) {
        flashMarketService.startTracking(fixtureId, match);
    }
  });

  socket.on('leave_game', (fixtureId) => {
    console.log(`Client ${socket.id} left game ${fixtureId}`);
    socket.leave(`game_${fixtureId}`);
    realDataService.stopMonitoring(fixtureId);
  });

  socket.on('place_bet', (data) => {
      console.log('\n==================================');
      console.log('🚨 NOVA APOSTA RECEBIDA NO SERVIDOR!');
      console.log('Dados:', data);
      console.log('User:', socket.userId, 'Balance:', usersDb[socket.userId].balance);
      console.log('==================================\n');

      const userId = socket.userId;
      const user = usersDb[userId];

      // 1. Validate Match & Data
      let match = null;
      if (data.matchId) {
          match = realDataService.getMatch(data.matchId);
      } else if (data.marketId) {
          const fixtureId = data.marketId.split('_')[1];
          match = realDataService.getMatch(fixtureId);
          data.matchId = fixtureId;
      }

      if (!match) {
          console.error(`[BET ERROR] Match not found.`);
          io.to(socket.id).emit('bet_rejected', { reason: "Jogo não encontrado." });
          return;
      }

      data.currentScore = `${match.goals.home}-${match.goals.away}`;

      // 2. Validate Game Status & Time
      const isLive = ['IN_PLAY'].includes(match.fixture.status.short);
      const currentMinute = match.fixture.status.elapsed;

      // Strict Time Check: Must be BEFORE window starts/ends (depending on market type logic)
      // For MVP, simplistic check: minute < windowEnd
      if (!isLive || currentMinute >= data.windowEnd) {
           console.error(`[BET ERROR] Time expired. Game: ${currentMinute}', Window End: ${data.windowEnd}`);
           io.to(socket.id).emit('bet_rejected', { reason: "Tempo esgotado ou jogo parado." });
           return;
      }

      // 3. Validate Balance & Amount
      if (data.amount <= 0) {
           console.error(`[BET ERROR] Invalid amount: ${data.amount}`);
           io.to(socket.id).emit('bet_rejected', { reason: "Valor inválido." });
           return;
      }

      if (user.balance < data.amount) {
           console.error(`[BET ERROR] Insufficient balance. Has: ${user.balance}, Needs: ${data.amount}`);
           io.to(socket.id).emit('bet_rejected', { reason: "Saldo insuficiente." });
           return;
      }

      // 4. Process Transaction
      user.balance -= data.amount;

      // 5. Register Bet
      // Pass userId to BetService so it knows who to refund/pay later
      data.userId = userId;
      betService.placeBet(data, socket.id);

      // 6. Success Response
      io.to(socket.id).emit('bet_accepted', {
          amount: data.amount,
          newBalance: user.balance,
          marketId: data.marketId
      });
      console.log(`[BET SUCCESS] Bet placed. New Balance: ${user.balance}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
