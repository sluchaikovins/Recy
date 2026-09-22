import { useState } from 'react';
import { api, setToken } from '../api/client';
import { Logo } from '../components/Logo';

export function Login({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    try {
      const result =
        mode === 'login' ? await api.login(email, password) : await api.register(username, email, password);
      setToken(result.token);
      onAuth();
    } catch (authError) {
      setError((authError as Error).message);
    }
  };

  return (
    <div className="card auth">
      <h1 aria-label="Recy">
        <Logo className="auth-logo" />
      </h1>
      <p className="muted">Сканируй чеки — узнай, какой ты шопоголик.</p>

      <div className="tabs">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
          Вход
        </button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
          Регистрация
        </button>
      </div>

      {mode === 'register' && (
        <label>
          Имя
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
      )}
      <label>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        Пароль
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>

      <button
        type="button"
        className="big-button"
        onClick={submit}
        disabled={!email || !password || (mode === 'register' && !username)}
      >
        {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
