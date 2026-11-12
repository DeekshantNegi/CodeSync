export function loadConfig(env = process.env) {
  const required = ['JWT_SECRET', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing required audio-service environment variables: ${missing.join(', ')}`);
  }
  if (Buffer.byteLength(env.JWT_SECRET, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be at least 32 bytes and match the Spring Boot backend secret.');
  }

  const liveKitUrl = env.LIVEKIT_URL.trim();
  if (!/^wss?:\/\//i.test(liveKitUrl)) {
    throw new Error('LIVEKIT_URL must start with ws:// or wss://.');
  }

  const databaseUrl = env.DB_URL?.replace(/^jdbc:postgresql:/i, 'postgresql:');
  const database = databaseUrl
    ? { connectionString: databaseUrl }
    : {
        host: env.DB_HOST || '127.0.0.1',
        port: Number(env.DB_PORT || 5432),
        database: env.DB_NAME || 'CodeSync',
        user: env.DB_USERNAME || 'postgres',
        password: env.DB_PASSWORD,
      };

  if (env.DB_SSL === 'true') {
    database.ssl = { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
  }

  return {
    port: Number(env.AUDIO_PORT || 8090),
    jwtSecret: env.JWT_SECRET,
    liveKitUrl,
    liveKitHttpUrl: liveKitUrl.replace(/^ws/i, 'http'),
    liveKitApiKey: env.LIVEKIT_API_KEY,
    liveKitApiSecret: env.LIVEKIT_API_SECRET,
    allowedOrigins: (env.AUDIO_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    database,
    databaseMaxConnections: Number(env.DB_POOL_MAX || 10),
  };
}
