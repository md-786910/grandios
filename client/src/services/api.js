const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

// Helper function to get auth token
const getToken = () => localStorage.getItem("token");

// Helper function for API calls
const apiCall = async (endpoint, options = {}) => {
  const token = getToken();

  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  const response = await fetch(`${API_URL}${endpoint}`, config);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "API call failed");
  }

  const data = await response.json();
  // Wrap response to match axios-style format
  return { data };
};

// Auth API
export const authAPI = {
  login: (email, password) =>
    apiCall("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () => apiCall("/auth/logout", { method: "POST" }),

  getMe: () => apiCall("/auth/me"),

  updateDetails: (data) =>
    apiCall("/auth/updatedetails", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  updatePassword: (currentPassword, newPassword) =>
    apiCall("/auth/updatepassword", {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  forgotPassword: (email) =>
    apiCall("/auth/forgotpassword", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token, password) =>
    apiCall(`/auth/resetpassword/${token}`, {
      method: "PUT",
      body: JSON.stringify({ password }),
    }),
};

// Dashboard API
export const dashboardAPI = {
  getStats: () => apiCall("/dashboard/stats"),

  getRecentOrders: (limit = 6) =>
    apiCall(`/dashboard/recent-orders?limit=${limit}`),
};

// Customers API
export const customersAPI = {
  getAll: (page = 1, limit = 10) =>
    apiCall(`/customers?page=${page}&limit=${limit}`),

  getById: (id) => apiCall(`/customers/${id}`),

  create: (data) =>
    apiCall("/customers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    apiCall(`/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id) => apiCall(`/customers/${id}`, { method: "DELETE" }),

  search: (query) => apiCall(`/customers/search?q=${query}`),
};

// Orders API
export const ordersAPI = {
  getAll: (page = 1, limit = 10, customerId = null) => {
    let url = `/orders?page=${page}&limit=${limit}`;
    if (customerId) url += `&customerId=${customerId}`;
    return apiCall(url);
  },

  getById: (id) => apiCall(`/orders/${id}`),

  create: (data) =>
    apiCall("/orders", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    apiCall(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id) => apiCall(`/orders/${id}`, { method: "DELETE" }),

  updateItem: (orderId, itemId, data) =>
    apiCall(`/orders/${orderId}/items/${itemId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteItem: (orderId, itemId) =>
    apiCall(`/orders/${orderId}/items/${itemId}`, { method: "DELETE" }),
};

// Discounts API (Rabatt)
export const discountsAPI = {
  getAll: (page = 1, limit = 10) =>
    apiCall(`/discounts?page=${page}&limit=${limit}`),

  getCustomerDiscount: (customerId) => apiCall(`/discounts/${customerId}`),

  createGroup: (customerId, orderIds, discountRate = 10) =>
    apiCall(`/discounts/${customerId}/groups`, {
      method: "POST",
      body: JSON.stringify({ orderIds, discountRate }),
    }),

  redeemGroup: (customerId, groupId) =>
    apiCall(`/discounts/${customerId}/groups/${groupId}/redeem`, {
      method: "PUT",
    }),

  deleteGroup: (customerId, groupId) =>
    apiCall(`/discounts/${customerId}/groups/${groupId}`, {
      method: "DELETE",
    }),

  updateGroup: (customerId, groupId, orderIds, discountRate = 10) =>
    apiCall(`/discounts/${customerId}/groups/${groupId}`, {
      method: "PUT",
      body: JSON.stringify({ orderIds, discountRate }),
    }),

  updateNotes: (customerId, notes) =>
    apiCall(`/discounts/${customerId}/notes`, {
      method: "PUT",
      body: JSON.stringify({ notes }),
    }),
};

// Settings API
export const settingsAPI = {
  get: () => apiCall("/settings"),

  update: (data) =>
    apiCall("/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  getDiscountSettings: () => apiCall("/settings/discount"),

  updateDiscountSettings: (data) =>
    apiCall("/settings/discount", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

// Queue API (Order Customer Queue)
export const queueAPI = {
  getAll: () => apiCall("/queue"),

  getCustomerQueue: (customerId) => apiCall(`/queue/${customerId}`),

  processQueue: (customerId) =>
    apiCall(`/queue/${customerId}/process`, {
      method: "POST",
    }),

  removeOrder: (customerId, orderId) =>
    apiCall(`/queue/${customerId}/orders/${orderId}`, {
      method: "DELETE",
    }),

  clearQueue: (customerId) =>
    apiCall(`/queue/${customerId}`, {
      method: "DELETE",
    }),
};

// Test Data API (for development/testing)
export const testAPI = {
  generateCustomer: () =>
    apiCall("/test/customer", { method: "POST" }),

  generateOrders: (customerId, count = 3) =>
    apiCall(`/test/orders/${customerId}`, {
      method: "POST",
      body: JSON.stringify({ count }),
    }),

  generateCompleteData: (customerCount = 3, ordersPerCustomer = 4) =>
    apiCall("/test/generate", {
      method: "POST",
      body: JSON.stringify({ customerCount, ordersPerCustomer }),
    }),

  clearTestData: () =>
    apiCall("/test/clear", { method: "DELETE" }),
};

// Sync API (WAWI Integration)
export const syncAPI = {
  // Get sync status
  getStatus: () => apiCall("/sync/status"),

  // Trigger sync operations
  syncCustomers: () => apiCall("/sync/customers", { method: "POST" }),
  syncOrders: () => apiCall("/sync/orders", { method: "POST" }),
  syncProducts: () => apiCall("/sync/products", { method: "POST" }),
  syncAll: () => apiCall("/sync/full", { method: "POST" }),

  // Get synced data with pagination
  getCustomers: (page = 1, limit = 20, search = "") => {
    let url = `/sync/data/customers?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return apiCall(url);
  },

  getOrders: (page = 1, limit = 20, customerId = null) => {
    let url = `/sync/data/orders?page=${page}&limit=${limit}`;
    if (customerId) url += `&customerId=${customerId}`;
    return apiCall(url);
  },

  getProducts: (page = 1, limit = 20, search = "") => {
    let url = `/sync/data/products?page=${page}&limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return apiCall(url);
  },
};

// WAWI External API (Direct API calls)
export const wawiAPI = {
  testConnection: () => apiCall("/wawi/test"),
  getStatus: () => apiCall("/wawi/status"),
  refreshToken: () => apiCall("/wawi/refresh-token", { method: "POST" }),

  getCustomers: (limit = 100, offset = 0, search = "") => {
    let url = `/wawi/customers?limit=${limit}&offset=${offset}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return apiCall(url);
  },

  getOrders: (limit = 100, offset = 0, partnerId = null) => {
    let url = `/wawi/orders?limit=${limit}&offset=${offset}`;
    if (partnerId) url += `&partner_id=${partnerId}`;
    return apiCall(url);
  },

  getProducts: (limit = 100, offset = 0, search = "") => {
    let url = `/wawi/products?limit=${limit}&offset=${offset}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return apiCall(url);
  },

  searchModel: (model, options = {}) => {
    const { limit = 100, offset = 0, fields, domain, order } = options;
    let url = `/wawi/search/${model}?limit=${limit}&offset=${offset}`;
    if (fields) url += `&fields=${encodeURIComponent(JSON.stringify(fields))}`;
    if (domain) url += `&domain=${encodeURIComponent(JSON.stringify(domain))}`;
    if (order) url += `&order=${encodeURIComponent(order)}`;
    return apiCall(url);
  },
};

export default {
  auth: authAPI,
  dashboard: dashboardAPI,
  customers: customersAPI,
  orders: ordersAPI,
  discounts: discountsAPI,
  settings: settingsAPI,
  queue: queueAPI,
  test: testAPI,
  sync: syncAPI,
  wawi: wawiAPI,
};
