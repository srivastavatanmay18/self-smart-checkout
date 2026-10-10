type RuntimeEnvironment = NodeJS.ProcessEnv;

/** Fail fast on unsafe or incomplete deployment configuration while preserving local demo defaults. */
export function validateRuntimeConfiguration(environment: RuntimeEnvironment = process.env): void {
  if (environment.NODE_ENV !== 'production') return;

  const missing = ['MONGODB_URI', 'JWT_SECRET']
    .filter((key) => !environment[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Production configuration is missing required variables: ${missing.join(', ')}.`);
  }

  const mongoUri = environment.MONGODB_URI!.trim();
  validateMongoUri(mongoUri);

  const jwtSecret = environment.JWT_SECRET!.trim();
  if (jwtSecret.length < 32 || /replace-with-a-random-secret/i.test(jwtSecret)) {
    throw new Error('JWT_SECRET must be a private random value with at least 32 characters in production.');
  }

  // Native Android requests do not send a browser Origin header. Only require
  // CORS_ORIGINS when a browser client is deployed; if configured, keep it strict.
  const origins = environment.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  if (origins.some((origin) => !isSecureOrigin(origin))) {
    throw new Error('CORS_ORIGINS must contain exact HTTPS origins in production; wildcard and local origins are not allowed.');
  }

  const demoPasswordKeys = ['DEMO_GUARD_PASSWORD', 'DEMO_SALESMAN_PASSWORD', 'DEMO_ACCOUNT_PASSWORD'];
  if (demoPasswordKeys.some((key) => Boolean(environment[key]?.trim()))) {
    throw new Error('Remove demo staff passwords from the production environment.');
  }

  const paymentMode = (environment.PAYMENT_MODE ?? 'sandbox').trim().toLowerCase();
  if (paymentMode !== 'sandbox') {
    throw new Error('This prototype supports sandbox payment only; configure PAYMENT_MODE=sandbox.');
  }
}

function validateMongoUri(value: string): void {
  if (!/^mongodb(?:\+srv)?:\/\//i.test(value)) {
    throw new Error('MONGODB_URI must be a MongoDB connection URI in production.');
  }

  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    throw new Error('MONGODB_URI is malformed.');
  }

  if (!uri.hostname) {
    throw new Error('MONGODB_URI must include a database host.');
  }
  if (uri.protocol.toLowerCase() === 'mongodb+srv:' && uri.port) {
    throw new Error('MONGODB_URI using mongodb+srv must not include an explicit port.');
  }
}

function isSecureOrigin(value: string): boolean {
  try {
    const origin = new URL(value);
    return origin.protocol === 'https:' && origin.origin === value;
  } catch {
    return false;
  }
}
