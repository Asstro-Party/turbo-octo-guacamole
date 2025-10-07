import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, getGames } from '../services/api';

function Profile({ user, token, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const [profileRes, gamesRes] = await Promise.all([
        getProfile(),
        getGames(10)
      ]);
      setProfile(profileRes.data);
      setGames(gamesRes.data);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading profile...</div>;
  }

  return (
    <div className="profile-page">
      <header>
        <h1>Astro Party</h1>
        <div className="header-actions">
          <button onClick={() => navigate('/lobby')}>Back to Lobby</button>
          <button onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="profile-container">
        <div className="profile-header">
          <h2>{profile?.username}'s Profile</h2>
          <p>Member since: {new Date(profile?.createdAt).toLocaleDateString()}</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Kills</h3>
            <p className="stat-value">{profile?.stats.totalKills || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Total Deaths</h3>
            <p className="stat-value">{profile?.stats.totalDeaths || 0}</p>
          </div>
          <div className="stat-card">
            <h3>K/D Ratio</h3>
            <p className="stat-value">{profile?.stats.kdRatio?.toFixed(2) || '0.00'}</p>
          </div>
          <div className="stat-card">
            <h3>Total Games</h3>
            <p className="stat-value">{profile?.stats.totalGames || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Wins</h3>
            <p className="stat-value">{profile?.stats.wins || 0}</p>
          </div>
          <div className="stat-card">
            <h3>Win Rate</h3>
            <p className="stat-value">{profile?.stats.winRate?.toFixed(1) || '0.0'}%</p>
          </div>
        </div>

        <div className="recent-games">
          <h3>Recent Games</h3>
          {games.length === 0 ? (
            <p>No games played yet. Start playing to see your match history!</p>
          ) : (
            <table className="games-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kills</th>
                  <th>Deaths</th>
                  <th>Placement</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr key={game.id}>
                    <td>{new Date(game.started_at || game.created_at).toLocaleDateString()}</td>
                    <td>{game.kills}</td>
                    <td>{game.deaths}</td>
                    <td>{game.placement ? `#${game.placement}` : '-'}</td>
                    <td>{game.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default Profile;
