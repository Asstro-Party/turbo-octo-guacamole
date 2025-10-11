import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Lobby from './pages/Lobby';
import Profile from './pages/Profile';
import Game from './pages/Game';
import WaitingRoom from './pages/WaitingRoom';
import { getCurrentLobby } from './services/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [isCheckingLobby, setIsCheckingLobby] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  // Check for active lobby on mount
  useEffect(() => {
    const checkActiveLobby = async () => {
      if (token && user) {
        try {
          const response = await getCurrentLobby();
          if (response.data.lobbyId) {
            const { lobbyId, lobby } = response.data;
            // Redirect to appropriate page based on lobby status
            if (lobby.status === 'in_progress') {
              navigate(`/game/${lobbyId}`, { replace: true });
            } else {
              navigate(`/waiting/${lobbyId}`, { replace: true });
            }
          }
        } catch (error) {
          console.error('Failed to check active lobby:', error);
        }
      }
      setIsCheckingLobby(false);
    };

    checkActiveLobby();
  }, [token, user, navigate]);

  const handleLogin = (token, user) => {
    setToken(token);
    setUser(user);
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // Show loading state while checking for active lobby
  if (isCheckingLobby && token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="text-sm uppercase tracking-[0.3em] text-slate-300/70">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/lobby" /> : <Login onLogin={handleLogin} />}
      />
      <Route
        path="/signup"
        element={token ? <Navigate to="/lobby" /> : <Signup onSignup={handleLogin} />}
      />
      <Route
        path="/lobby"
        element={token ? <Lobby user={user} token={token} onLogout={handleLogout} /> : <Navigate to="/login" />}
      />
      <Route
        path="/profile"
        element={token ? <Profile user={user} token={token} onLogout={handleLogout} /> : <Navigate to="/login" />}
      />
      <Route
        path="/waiting/:lobbyId"
        element={token ? <WaitingRoom user={user} token={token} /> : <Navigate to="/login" />}
      />
      <Route
        path="/game/:lobbyId"
        element={token ? <Game user={user} token={token} /> : <Navigate to="/login" />}
      />
      <Route path="/" element={<Navigate to={token ? "/lobby" : "/login"} />} />
    </Routes>
  );
}

export default App;
