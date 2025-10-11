import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { login } from '../services/api';
import SpaceBackground from '../components/SpaceBackground';

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState({ username: false, password: false });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(username, password);
      onLogin(response.data.token, response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const floatingLabel = (active) =>
    active
      ? 'top-2 text-[0.65rem] uppercase tracking-[0.35em] text-sky-300'
      : 'top-4 text-sm text-slate-200/70';

  const inputClass =
    'w-full rounded-2xl border border-white/15 bg-slate-950/60 px-4 pb-3 pt-6 text-base text-slate-100 shadow-inner shadow-black/10 transition focus:border-sky-400 focus:outline-none focus:ring-0';

  return (
    <SpaceBackground contentClassName="py-16">
      <div className="w-full max-w-xl space-y-10">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.4em] text-slate-100 drop-shadow-lg">
            Asstro Party
          </h1>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/30 p-8 shadow-glass-lg backdrop-blur-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <label
                htmlFor="login-username"
                className={`pointer-events-none absolute left-4 text-xs font-medium transition-all duration-200 ${floatingLabel(
                  isFocused.username || !!username
                )}`}
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onFocus={() => setIsFocused((prev) => ({ ...prev, username: true }))}
                onBlur={() => setIsFocused((prev) => ({ ...prev, username: false }))}
                onChange={(event) => setUsername(event.target.value)}
                required
                autoComplete="username"
                className={inputClass}
              />
            </div>

            <div className="relative">
              <label
                htmlFor="login-password"
                className={`pointer-events-none absolute left-4 text-xs font-medium transition-all duration-200 ${floatingLabel(
                  isFocused.password || !!password
                )}`}
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onFocus={() => setIsFocused((prev) => ({ ...prev, password: true }))}
                onBlur={() => setIsFocused((prev) => ({ ...prev, password: false }))}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500 py-3 text-xs font-semibold uppercase tracking-[0.45em] text-slate-50 shadow-lg shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:shadow-indigo-500/50 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {loading ? 'Logging in...' : 'Launch'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-300/80">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-sky-300 hover:text-sky-200">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </SpaceBackground>
  );
}

export default Login;
