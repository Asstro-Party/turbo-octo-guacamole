import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const signup = (username, email, password) =>
  api.post('/auth/signup', { username, email, password });

export const login = (username, password) =>
  api.post('/auth/login', { username, password });

export const logout = () =>
  api.post('/auth/logout');

// Profile
export const getProfile = () =>
  api.get('/profile');

export const getGames = (limit = 10) =>
  api.get(`/profile/games?limit=${limit}`);

// Lobby
export const getCurrentLobby = () =>
  api.get('/lobby/current');

export const getLobbies = () =>
  api.get('/lobby/list');

export const createLobby = (maxPlayers = 4) =>
  api.post('/lobby/create', { maxPlayers });

export const joinLobby = (lobbyId) =>
  api.post(`/lobby/${lobbyId}/join`);

export const leaveLobby = (lobbyId) =>
  api.post(`/lobby/${lobbyId}/leave`);

export const getLobby = (lobbyId) =>
  api.get(`/lobby/${lobbyId}`);

export const selectPlayerModel = (lobbyId, model) =>
  api.post(`/lobby/${lobbyId}/select-model`, { model });

export default api;
