import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function AuthGate() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await (mode === 'login' ? login : register)(username.trim(), password);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="home" style={{ maxWidth: 420 }}>
      <div className="card">
        <h2>{mode === 'login' ? 'Log in' : 'Create account'}</h2>
        {err && <p className="search-error">{err}</p>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          <input
            placeholder="Username"
            value={username}
            autoComplete="username"
            maxLength={20}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? '…' : mode === 'login' ? 'Log in' : 'Register'}
          </button>
        </form>
        <button
          className="clear-selection"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setErr(null);
          }}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
        </button>
      </div>
    </section>
  );
}
