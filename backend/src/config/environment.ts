type RuntimeEnvironment = NodeJS.ProcessEnv;

/** Fail fast on unsafe or incomplete deployment configuration while preserving local demo defaults. */
export function validateRuntimeConfiguration(environment: RuntimeEnvironment = process.env): void {
  if (environment.NODE_ENV !== 'production') return;

  const missing = ['MONGODB_URI', 'JWT_SECRET', 'CORS_ORIGINS']
    .filter((key) => !environment[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Production configuration is missing required variables: ${missing.join(', ')}.`);
  }

  const mongoUri = environment.MONGODB_URI!.trim();
  if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUri)) {
    throw new Error('MONGODB_URI must be a MongoDB connection URI in production.');
  }

  const jwtSecret = environment.JWT_SECRET!.trim();
  if (jwtSecret.length < 32 || /replace-with-a-random-secret/i.test(jwtSecret)) {
    throw new Error('JWT_SECRET must be a private random value with at least 32 characters in production.');
  }

  const origins = environment.CORS_ORIGINS!.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => !isSecureOrigin(origin))) {
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

function isSecureOrigin(value: string): boolean {
  try {
    const origin = new URL(value);
    return origin.protocol === 'https:' && origin.origin === value;
  } catch {
    return false;
  }
}
