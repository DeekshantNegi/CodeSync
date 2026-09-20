import axios from "axios";

const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8080/api",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

httpClient.interceptors.request.use((config) => {
  const savedUser = localStorage.getItem("codesync.user");
  const token = savedUser ? JSON.parse(savedUser).token : null;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Request failed";

    if (error.response?.status === 401) {
      localStorage.removeItem("codesync.user");
    }

    return Promise.reject(new Error(message));
  }
);

export default httpClient;
