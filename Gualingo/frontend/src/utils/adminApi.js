import axios from 'axios';

const baseUrl = '';

export const adminApi = {
  login: async (email, password) => {
    const response = await axios.post(`${baseUrl}/api/admin/login`, { email, password });
    return response.data;
  },

  getDashboard: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/dashboard`);
    return response.data;
  },

  getApiKeys: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/api-keys`);
    return response.data;
  },

  updateApiKeys: async (tier, configs, activeIndex = 0) => {
    const response = await axios.put(`${baseUrl}/api/admin/api-keys/${tier}`, { configs, active_index: activeIndex });
    return response.data;
  },

  testApiKey: async (tier) => {
    const response = await axios.post(`${baseUrl}/api/admin/api-keys/${tier}/test`);
    return response.data;
  },

  getUsers: async (page = 1, search = '', tier = '', status = '', sort = 'created_at', order = 'desc') => {
    const params = { page, page_size: 20, sort, order };
    if (search) params.search = search;
    if (tier) params.tier = tier;
    if (status) params.status = status;
    const response = await axios.get(`${baseUrl}/api/admin/users`, { params });
    return response.data;
  },

  getUserDetail: async (userId) => {
    const response = await axios.get(`${baseUrl}/api/admin/users/${userId}`);
    return response.data;
  },

  updateUser: async (userId, data) => {
    const response = await axios.put(`${baseUrl}/api/admin/users/${userId}`, data);
    return response.data;
  },

  adjustUserQuota: async (userId, action, value) => {
    const response = await axios.put(`${baseUrl}/api/admin/users/${userId}/quota`, { action, value });
    return response.data;
  },

  banUser: async (userId, reason = '') => {
    const response = await axios.post(`${baseUrl}/api/admin/users/${userId}/ban`, { reason });
    return response.data;
  },

  unbanUser: async (userId) => {
    const response = await axios.post(`${baseUrl}/api/admin/users/${userId}/unban`);
    return response.data;
  },

  deleteUser: async (userId) => {
    const response = await axios.delete(`${baseUrl}/api/admin/users/${userId}`);
    return response.data;
  },

  batchBan: async (userIds, reason = '') => {
    const response = await axios.post(`${baseUrl}/api/admin/users/batch-ban`, { user_ids: userIds, reason });
    return response.data;
  },

  batchUnban: async (userIds) => {
    const response = await axios.post(`${baseUrl}/api/admin/users/batch-unban`, { user_ids: userIds });
    return response.data;
  },

  batchDelete: async (userIds) => {
    const response = await axios.post(`${baseUrl}/api/admin/users/batch-delete`, { user_ids: userIds });
    return response.data;
  },

  getUserHistory: async (userId) => {
    const response = await axios.get(`${baseUrl}/api/admin/users/${userId}/history`);
    return response.data;
  },

  getUserFavorites: async (userId, sourceLang) => {
    const params = {};
    if (sourceLang) params.source_lang = sourceLang;
    const response = await axios.get(`${baseUrl}/api/admin/users/${userId}/favorites`, { params });
    return response.data;
  },

  getUserPreferences: async (userId) => {
    const response = await axios.get(`${baseUrl}/api/admin/users/${userId}/preferences`);
    return response.data;
  },

  getUserWordList: async (userId, sourceLang) => {
    const params = {};
    if (sourceLang) params.source_lang = sourceLang;
    const response = await axios.get(`${baseUrl}/api/admin/users/${userId}/word-list`, { params });
    return response.data;
  },

  batchAdjustQuota: async (targetTier, action, value) => {
    const response = await axios.post(`${baseUrl}/api/admin/quota/batch`, {
      target_tier: targetTier || null, action, value,
    });
    return response.data;
  },

  getBlacklist: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/blacklist`);
    return response.data;
  },

  addToBlacklist: async (email, reason = '') => {
    const response = await axios.post(`${baseUrl}/api/admin/blacklist`, { email, reason });
    return response.data;
  },

  removeFromBlacklist: async (userId) => {
    const response = await axios.delete(`${baseUrl}/api/admin/blacklist/${userId}`);
    return response.data;
  },

  getCosts: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/costs`);
    return response.data;
  },

  getCostTrend: async (days = 30) => {
    const response = await axios.get(`${baseUrl}/api/admin/costs/trend`, { params: { days } });
    return response.data;
  },

  getCostByModel: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/costs/by-model`);
    return response.data;
  },

  getLogs: async (page = 1) => {
    const response = await axios.get(`${baseUrl}/api/admin/logs`, { params: { page, page_size: 20 } });
    return response.data;
  },

  getGlobalSettings: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/global-settings`);
    return response.data;
  },

  updateGlobalSettings: async (data) => {
    const response = await axios.put(`${baseUrl}/api/admin/global-settings`, data);
    return response.data;
  },
};
