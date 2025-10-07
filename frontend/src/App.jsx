import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Lobby from './pages/Lobby';
import Profile from './pages/Profile';
import Game from './pages/Game';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));

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

  return (
    <div className="app">
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
          path="/game/:lobbyId"
          element={token ? <Game user={user} token={token} /> : <Navigate to="/login" />}
        />
        <Route path="/" element={<Navigate to={token ? "/lobby" : "/login"} />} />
      </Routes>
    </div>
  );
}

export default App;
