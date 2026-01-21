import axios from 'axios';

// Helper to construct the base URL correctly
const getBaseUrl = () => {
  let url = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  
  // Remove trailing slash if present to avoid double slashes
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }

  // Check if '/api' is already there, if not, add it
  // This handles cases where VITE_API_URL is just the domain
  if (!url.endsWith('/api')) {
    url += '/api';
  }

  return url;
};

const API_URL = getBaseUrl();

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Debug log to confirm the EXACT URL being hit
    console.log(`📤 Making ${config.method?.toUpperCase()} request to: ${config.baseURL}${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor with better refresh token handling
api.interceptors.response.use(
  (response) => {
    // Return just the data property to simplify usage
    return response.data || response.data; 
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Detailed error logging for debugging
    console.error('❌ API Error Details:', {
      endpoint: `${error.config?.baseURL}${error.config?.url}`,
      status: error.response?.status,
      message: error.response?.data?.message || error.message
    });

    // Handle 401 errors with refresh token retry
    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== '/auth/refresh-token') {
      originalRequest._retry = true;

      try {
        console.log('🔄 Attempting to refresh access token...');
        // Note: We don't use the 'api' instance here to avoid infinite loops if this fails
        // We manually construct the axios call or use a separate instance if needed.
        // For now, using the same instance is okay IF the refresh endpoint is excluded in the check above.
        
        await api.post('/auth/refresh-token', {});
        console.log('✅ Access token refreshed successfully');
        
        // Retry the original request
        return api(originalRequest);
      } catch (refreshError) {
        console.error('❌ Refresh token failed:', refreshError.response?.data?.message);
        
        // Redirect to login
        // Use window.location to force a full reload and clear any efficient-state
        window.location.href = '/login';
        
        return Promise.reject(new Error('Session expired. Please log in again.'));
      }
    }

    const errorMessage = error.response?.data?.message || error.message || 'An unexpected error occurred';
    throw new Error(errorMessage);
  }
);

// API functions
export const adminLogin = async (email, password) => {
  try {
    const cleanEmail = String(email).trim();
    const cleanPassword = String(password).trim();
    
    // This will now hit baseURL + /auth/login -> .../api/auth/login
    const response = await api.post('/auth/login', { 
      email: cleanEmail, 
      password: cleanPassword 
    });
    
    // Depending on your backend, you might need response.data or just response
    // If your interceptor returns response.data, use response directly.
    // If your interceptor returns response, use response.data.
    // Based on standard axios:
    return response.data; 
  } catch (error) {
    console.error('Login API Error:', error);
    throw error; // Let the UI handle the error display
  }
};

export const refreshAccessToken = async () => {
  return api.post('/auth/refresh-token', {});
};

export const logout = async () => {
  return api.post('/auth/logout', {});
};

// Data Fetching Functions
export const registerAdmin = async (data) => api.post('/auth/register', data);
export const getDashboardData = async () => api.get('/dashboard');
export const getCustomers = async (params) => api.get('/customers', { params });
export const getCustomerById = async (id) => api.get(`/customers/${id}`);
export const getReturnStats = async () => api.get('/returns/stats');
export const getReturns = async (params) => api.get('/returns', { params });
export const getReturnById = async (id) => api.get(`/returns/${id}`);
export const getAnalyticsData = async (period = '12months') => api.get('/analytics', { params: { period } });

export default api;