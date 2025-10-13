import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProfile, getGames } from '../services/api';
import SpaceBackground from '../components/SpaceBackground';

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
    return (
      <SpaceBackground contentClassName="items-center justify-center">
        <div className="text-sm uppercase tracking-[0.3em] text-slate-300/70">Loading profile...</div>
      </SpaceBackground>
    );
  }

  return (
    <SpaceBackground contentClassName="gap-10 py-14">
      <header className="w-full max-w-6xl rounded-3xl border border-white/10 bg-slate-900/30 px-6 py-6 shadow-glass-lg backdrop-blur-2xl sm:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold uppercase tracking-[0.4em] text-slate-100 drop-shadow">
              Astro Party
            </h1>
            <p className="mt-2 text-xs uppercase tracking-[0.35em] text-slate-300/80">
              Pilot dossier
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => navigate('/lobby')}
              className="rounded-2xl border border-white/15 bg-slate-900/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-slate-200 transition hover:border-sky-400/60 hover:text-white"
            >
              Back to Lobby
            </button>
            <button
              onClick={onLogout}
              className="rounded-2xl border border-white/15 bg-slate-900/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-slate-200 transition hover:border-rose-400/60 hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="grid w-full max-w-6xl gap-10">
        <section className="rounded-3xl border border-white/10 bg-slate-900/25 p-10 text-center shadow-glass-lg backdrop-blur-2xl">
          <h2 className="text-2xl font-semibold text-slate-100">{profile?.username}&apos;s Profile</h2>
          <p className="mt-3 text-xs uppercase tracking-[0.32em] text-slate-300/75">
            Member since: {new Date(profile?.createdAt).toLocaleDateString()}
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {[
            { label: 'Total Kills', value: profile?.stats.totalKills || 0 },
            { label: 'Total Deaths', value: profile?.stats.totalDeaths || 0 },
            { label: 'K/D Ratio', value: profile?.stats.kdRatio?.toFixed(2) || '0.00' },
            { label: 'Total Games', value: profile?.stats.totalGames || 0 },
            { label: 'Wins', value: profile?.stats.wins || 0 },
            { label: 'Win Rate', value: `${profile?.stats.winRate?.toFixed(1) || '0.0'}%` }
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-3xl border border-white/10 bg-slate-900/40 p-8 text-center shadow-lg shadow-black/30 backdrop-blur-xl"
            >
              <h3 className="text-xs uppercase tracking-[0.35em] text-slate-300/70">{stat.label}</h3>
              <p className="mt-4 text-3xl font-semibold text-slate-100">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/25 p-8 shadow-glass-lg backdrop-blur-2xl">
          <h3 className="text-lg font-semibold uppercase tracking-[0.32em] text-slate-200">
            Recent Games
          </h3>
          {games.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/50 px-6 py-10 text-center text-sm uppercase tracking-[0.28em] text-slate-300/70">
              No games played yet. Start playing to see your match history!
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm text-slate-200">
                <thead className="bg-slate-900/70 text-[0.6rem] uppercase tracking-[0.35em] text-slate-300/80">
                  <tr>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Kills</th>
                    <th className="px-6 py-3">Deaths</th>
                    <th className="px-6 py-3">Placement</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-900/40">
                  {games.map((game) => (
                    <tr key={game.id} className="hover:bg-slate-900/70">
                      <td className="px-6 py-4 text-xs uppercase tracking-[0.25em] text-slate-300/80">
                        {new Date(game.started_at || game.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-base text-slate-100">{game.kills}</td>
                      <td className="px-6 py-4 text-base text-slate-100">{game.deaths}</td>
                      <td className="px-6 py-4 text-base text-slate-100">
                        {game.placement ? `#${game.placement}` : '-'}
                      </td>
                      <td className="px-6 py-4 text-xs uppercase tracking-[0.25em] text-slate-300/80">
                        {game.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </SpaceBackground>
  );
}

export default Profile;
