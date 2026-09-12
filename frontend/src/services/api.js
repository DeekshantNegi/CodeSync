const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export async function fetchSessionHistory() {
  try {
    const res = await fetch(`${API_BASE_URL}/sessions`);
    if (!res.ok) throw new Error('Failed to fetch session history');
    return await res.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function executeCode(code, language) {
  try {
    const res = await fetch(`${API_BASE_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language }),
    });
    return await res.json();
  } catch (error) {
    return { output: 'Error executing code on the server.' };
  }
}