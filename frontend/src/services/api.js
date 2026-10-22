import httpClient from './httpClient';

export async function fetchSessionHistory() {
  try {
    const { data } = await httpClient.get('/history');
    return data;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function executeCode(code, language, token, fileName, stdin = '') {
  try {
    const { data } = await httpClient.post('/execute',
      { code, language, fileName, stdin },
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
    );
    return data;
  } catch (error) {
    throw new Error(error.response?.data?.stderr || error.message || 'Code execution failed.');
  }
}