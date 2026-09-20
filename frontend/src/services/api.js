import httpClient from './httpClient';

export async function fetchSessionHistory() {
  try {
    const { data } = await httpClient.get('/sessions');
    return data;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function executeCode(code, language, token, fileName) {
  try {
    const { data } = await httpClient.post('/execute',
      { code, language, fileName },
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
    );
    return data;
  } catch (error) {
    return { success: false, output: error.message };
  }
}