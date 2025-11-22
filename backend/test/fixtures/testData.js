export const testUsers = [
  { username: 'player1', email: 'player1@test.com', password: 'Test123!' },
  { username: 'player2', email: 'player2@test.com', password: 'Test123!' },
  { username: 'player3', email: 'player3@test.com', password: 'Test123!' },
  { username: 'player4', email: 'player4@test.com', password: 'Test123!' }
];

export const testLobbies = [
  { maxPlayers: 2, name: 'Quick Match' },
  { maxPlayers: 4, name: 'Full Squad' }
];

export const playerModels = [
  'player1.png',
  'player2.png',
  'player3.png',
  'player4.png'
];

export const testGameState = {
  players: {
    1: { x: 0, y: 0, angle: 0, health: 100 },
    2: { x: 100, y: 100, angle: 180, health: 100 }
  },
  bullets: [],
  status: 'active'
};