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

  // pool 引用管理：refs = [{key_id, max_tokens, disabled}]
  updateApiKeys: async (tier, sub, refs) => {
    const response = await axios.put(`${baseUrl}/api/admin/api-keys/${tier}`, { configs: refs, sub });
    return response.data;
  },

  testApiKey: async (tier, sub) => {
    const response = await axios.post(`${baseUrl}/api/admin/api-keys/${tier}/test`, null, { params: { sub } });
    return response.data;
  },

  // 测试所有 pool（所有 tier/sub）出现过的所有 key，每个 key_id 只测一次
  testAllKeys: async () => {
    const response = await axios.post(`${baseUrl}/api/admin/api-keys/test-all`);
    return response.data;
  },

  // 全局 key 定义 CRUD（引用语义模型：改一处全处生效）
  listKeyDefs: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/api-keys/defs`);
    return response.data;
  },
  createKeyDef: async (api_key, base_url, model, input_price_per_million = 0, output_price_per_million = 0, title = '') => {
    const response = await axios.post(`${baseUrl}/api/admin/api-keys/defs`, { api_key, base_url, model, input_price_per_million, output_price_per_million, title });
    return response.data;
  },
  updateKeyDef: async (keyId, fields) => {
    const response = await axios.put(`${baseUrl}/api/admin/api-keys/defs/${keyId}`, fields);
    return response.data;
  },
  deleteKeyDef: async (keyId) => {
    const response = await axios.delete(`${baseUrl}/api/admin/api-keys/defs/${keyId}`);
    return response.data;
  },
  getKeyRefs: async (keyId) => {
    const response = await axios.get(`${baseUrl}/api/admin/api-keys/defs/${keyId}/refs`);
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

  batchAdjustQuotaByUserIds: async (userIds, action, value) => {
    const response = await axios.post(`${baseUrl}/api/admin/quota/batch-by-ids`, { user_ids: userIds, action, value });
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

  getTopCostUsers: async (period = 'month', page = 1) => {
    const response = await axios.get(`${baseUrl}/api/admin/costs/top-users`, { params: { period, page, page_size: 20 } });
    return response.data;
  },

  getUserGrowth: async (days = 30) => {
    const response = await axios.get(`${baseUrl}/api/admin/user-growth`, { params: { days } });
    return response.data;
  },

  getKeyStatuses: async (tier, sub) => {
    const response = await axios.get(`${baseUrl}/api/admin/api-keys/${tier}/status`, { params: { sub } });
    return response.data;
  },

  // SSE 端点 URL：EventSource 不支持自定义 header，所以 token 通过 query 传递
  keyStatusStreamUrl: (tier, sub) => {
    const tokens = JSON.parse(localStorage.getItem('gualingo_tokens') || 'null');
    const token = tokens?.access_token || '';
    return `${baseUrl}/api/admin/api-keys/${tier}/status/stream?sub=${encodeURIComponent(sub)}&token=${encodeURIComponent(token)}`;
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

  getGlobalVocabStats: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/global-vocab/stats`);
    return response.data;
  },

  getGlobalVocabList: async (params = {}) => {
    const response = await axios.get(`${baseUrl}/api/admin/global-vocab/list`, { params });
    return response.data;
  },

  getGlobalVocabDetail: async (wordId) => {
    const response = await axios.get(`${baseUrl}/api/admin/global-vocab/${wordId}`);
    return response.data;
  },

  refreshGlobalVocab: async (wordId) => {
    const response = await axios.post(`${baseUrl}/api/admin/global-vocab/${wordId}/refresh`);
    return response.data;
  },

  deleteGlobalVocab: async (wordId) => {
    const response = await axios.delete(`${baseUrl}/api/admin/global-vocab/${wordId}`);
    return response.data;
  },
};
