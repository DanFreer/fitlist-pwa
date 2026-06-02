const API_BASE = '/api';

function saveSession({ token, username, displayName }) {
  localStorage.setItem('fitlist-token', token);
  localStorage.setItem('fitlist-user', username);
  localStorage.setItem('fitlist-displayName', displayName || username);
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function setAuthTab(mode) {
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === mode);
  });
  document.getElementById('auth-login').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('auth-register').style.display = mode === 'register' ? 'block' : 'none';
  showAuthError('');
}

async function submitLogin(event) {
  event.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) {
    showAuthError('Username and password are required.');
    return;
  }
  showAuthError('');
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.error || 'Login failed.');
      return;
    }
    saveSession(data);
    window.location.href = '/app';
  } catch {
    showAuthError('Unable to reach the server.');
  }
}

async function submitRegister(event) {
  event.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const displayName = document.getElementById('register-display').value.trim();
  const password = document.getElementById('register-password').value;
  if (!username || !password) {
    showAuthError('Username and password are required.');
    return;
  }
  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters.');
    return;
  }
  showAuthError('');
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName })
    });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.error || 'Registration failed.');
      return;
    }
    saveSession(data);
    window.location.href = '/app';
  } catch {
    showAuthError('Unable to reach the server.');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('fitlist-token')) {
    window.location.href = '/app';
    return;
  }
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => setAuthTab(tab.dataset.tab));
  });
  document.getElementById('login-form').addEventListener('submit', submitLogin);
  document.getElementById('register-form').addEventListener('submit', submitRegister);
  setAuthTab('login');
});
