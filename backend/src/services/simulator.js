// Event types
const EVENT_TYPES = [
  'match_start',
  'match_end',
  'goal',
  'corner',
  'yellow_card',
  'red_card',
  'danger',
  'safe',
  'substitution'
];

// Mock data generator
const generateEvent = () => {
  const eventType = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const timestamp = new Date().toISOString();

  return {
    type: eventType,
    timestamp,
    match_id: 'match_123', // Hardcoded for MVP
    details: {
      minute: Math.floor(Math.random() * 90) + 1,
      team: Math.random() > 0.5 ? 'Home' : 'Away',
      player: `Player ${Math.floor(Math.random() * 22) + 1}`
    }
  };
};

class Simulator {
  constructor() {
    this.intervalId = null;
    this.io = null;
  }

  start(io) {
    this.io = io;
    console.log('Simulator started...');

    // Simulate events every 5 seconds
    this.intervalId = setInterval(() => {
      const event = generateEvent();
      console.log('Simulating event:', event);
      this.io.emit('sport_event', event);
    }, 5000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Simulator stopped.');
    }
  }
}

module.exports = new Simulator();
