import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { signup } from '../services/api';
import SpaceBackground from '../components/SpaceBackground';

function Signup({ onSignup }) {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [focus, setFocus] = useState({
    username: false,
    email: false,
    password: false,
    confirmPassword: false
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const floatingLabel = (field) =>
    focus[field] || form[field]
      ? 'top-2 text-[0.65rem] uppercase tracking-[0.35em] text-sky-300'
      : 'top-4 text-sm text-slate-200/70';

  const inputClass =
    'w-full rounded-2xl border border-white/15 bg-slate-950/60 px-4 pb-3 pt-6 text-base text-slate-100 shadow-inner shadow-black/10 transition focus:border-sky-400 focus:outline-none focus:ring-0';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await signup(form.username, form.email, form.password);
      onSignup(response.data.token, response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SpaceBackground contentClassName="py-16">
      <div className="w-full max-w-2xl space-y-10">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.4em] text-slate-100 drop-shadow-lg">
            Asstro Party
          </h1>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/30 p-8 shadow-glass-lg backdrop-blur-2xl">
          <form onSubmit={handleSubmit} className="grid gap-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="relative">
                <label
                  htmlFor="signup-username"
                  className={`pointer-events-none absolute left-4 text-xs font-medium transition-all duration-200 ${floatingLabel('username')}`}
                >
                  Username
                </label>
                <input
                  id="signup-username"
                  type="text"
                  value={form.username}
                  onFocus={() => setFocus((prev) => ({ ...prev, username: true }))}
                  onBlur={() => setFocus((prev) => ({ ...prev, username: false }))}
                  onChange={handleChange('username')}
                  required
                  autoComplete="username"
                  className={inputClass}
                />
              </div>

              <div className="relative">
                <label
                  htmlFor="signup-email"
                  className={`pointer-events-none absolute left-4 text-xs font-medium transition-all duration-200 ${floatingLabel('email')}`}
                >
                  Email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  value={form.email}
                  onFocus={() => setFocus((prev) => ({ ...prev, email: true }))}
                  onBlur={() => setFocus((prev) => ({ ...prev, email: false }))}
                  onChange={handleChange('email')}
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="relative">
                <label
                  htmlFor="signup-password"
                  className={`pointer-events-none absolute left-4 text-xs font-medium transition-all duration-200 ${floatingLabel('password')}`}
                >
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  value={form.password}
                  onFocus={() => setFocus((prev) => ({ ...prev, password: true }))}
                  onBlur={() => setFocus((prev) => ({ ...prev, password: false }))}
                  onChange={handleChange('password')}
                  required
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>

              <div className="relative">
                <label
                  htmlFor="signup-confirm"
                  className={`pointer-events-none absolute left-4 text-xs font-medium transition-all duration-200 ${floatingLabel('confirmPassword')}`}
                >
                  Confirm Password
                </label>
                <input
                  id="signup-confirm"
                  type="password"
                  value={form.confirmPassword}
                  onFocus={() => setFocus((prev) => ({ ...prev, confirmPassword: true }))}
                  onBlur={() => setFocus((prev) => ({ ...prev, confirmPassword: false }))}
                  onChange={handleChange('confirmPassword')}
                  required
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-center text-sm text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-sky-500 to-indigo-500 py-3 text-xs font-semibold uppercase tracking-[0.45em] text-slate-50 shadow-lg shadow-emerald-400/30 transition hover:-translate-y-0.5 hover:shadow-emerald-400/45 disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {loading ? 'Preparing launch pad...' : 'Join the crew'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-300/80">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-sky-300 hover:text-sky-200">
              Login
            </Link>
          </p>
        </div>
      </div>
    </SpaceBackground>
  );
}

export default Signup;
