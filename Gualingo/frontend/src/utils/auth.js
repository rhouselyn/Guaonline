/** 认证工具：token 管理、axios 拦截器。 */

import axios from 'axios';

const TOKEN_KEY = 'gualingo_tokens';
const USER_KEY = 'gualingo_user';

export const auth = {
  getTokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; }
  },

  setTokens(tokens) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  },

  clearTokens() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  getAccessToken() {
    return this.getTokens()?.access_token || null;
  },

  getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  },

  setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  isLoggedIn() {
    return !!this.getAccessToken();
  },

  async login(email, password) {
    const response = await axios.post('/api/auth/login', { email, password });
    this.setTokens(response.data);
    await this.fetchUser();
    return response.data;
  },

  async register(email, password, name) {
    const response = await axios.post('/api/auth/register', { email, password, name });
    this.setTokens(response.data);
    await this.fetchUser();
    return response.data;
  },

  async fetchUser() {
    const token = this.getAccessToken();
    if (!token) return null;
    try {
      const response = await axios.get('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      this.setUser(response.data);
      return response.data;
    } catch {
      this.clearTokens();
      return null;
    }
  },

  logout() {
    this.clearTokens();
  }
};

// ponytail: 全局拦截器，自动附加 token + 401 刷新
axios.interceptors.request.use((config) => {
  const token = auth.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

axios.interceptors.response.use(
  (r) => r,
  async (error) => {
    const orig = error.config;
    if (error.response?.status === 401 && !orig._retry) {
      orig._retry = true;
      const tokens = auth.getTokens();
      if (tokens?.refresh_token) {
        try {
          const resp = await axios.post('/api/auth/refresh', tokens.refresh_token, {
            headers: { 'Content-Type': 'text/plain' }
          });
          auth.setTokens(resp.data);
          orig.headers.Authorization = `Bearer ${resp.data.access_token}`;
          return axios(orig);
        } catch {
          auth.clearTokens();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);
