import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cafe_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('cafe_token');
      localStorage.removeItem('cafe_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export function apiErrorMessage(err) {
  return err?.response?.data?.error || 'Something went wrong. Please try again.';
}
