import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { User, toPublicUser } from '../models/User.js';
import { getJwtSecret, signAccessToken } from '../middleware/auth.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;
let dummyPasswordHash: Promise<string> | undefined;

function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= bcrypt.hash('non-credential timing pad', BCRYPT_ROUNDS);
  return dummyPasswordHash;
}

function readCredentials(body: unknown): { email: string; password: string } | null {
  if (!body || typeof body !== 'object') return null;
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254 || Buffer.byteLength(password, 'utf8') > 72) return null;
  return { email: normalizedEmail, password };
}

export async function registerCustomer(request: Request, response: Response): Promise<void> {
  const body = request.body as Record<string, unknown> | undefined;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const credentials = readCredentials(request.body);

  if (name.length < 2 || name.length > 100 || !credentials || credentials.password.length < 8) {
    response.status(400).json({ error: 'Provide a name, valid email, and password of at least 8 characters.' });
    return;
  }
  try {
    getJwtSecret();
  } catch {
    response.status(503).json({ error: 'Authentication is not configured. Set JWT_SECRET in backend/.env.' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(credentials.password, BCRYPT_ROUNDS);
    const user = await User.create({
      name,
      email: credentials.email,
      passwordHash,
      role: 'CUSTOMER',
    });
    const publicUser = toPublicUser(user);
    response.status(201).json({ token: signAccessToken(publicUser), user: publicUser });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      response.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    throw error;
  }
}

export async function login(request: Request, response: Response): Promise<void> {
  const credentials = readCredentials(request.body);

  if (!credentials) {
    response.status(400).json({ error: 'Provide a valid email and password.' });
    return;
  }

  try {
    getJwtSecret();
  } catch {
    response.status(503).json({ error: 'Authentication is not configured. Set JWT_SECRET in backend/.env.' });
    return;
  }

  const user = await User.findOne({ email: credentials.email }).select('+passwordHash +tokenVersion');
  const passwordHash = user?.passwordHash ?? await getDummyPasswordHash();
  const passwordIsValid = await bcrypt.compare(credentials.password, passwordHash);

  if (!user || !passwordIsValid) {
    response.status(401).json({ error: 'Email or password is incorrect.' });
    return;
  }

  const publicUser = toPublicUser(user);
  response.json({ token: signAccessToken({ ...publicUser, tokenVersion: user.tokenVersion ?? 0 }), user: publicUser });
}

export async function logout(request: Request, response: Response): Promise<void> {
  const authUser = (request as Request & { authUser?: { id: string } }).authUser;
  if (!authUser) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }
  await User.updateOne({ _id: authUser.id }, { $inc: { tokenVersion: 1 } });
  response.status(204).end();
}

export async function currentUser(request: Request, response: Response): Promise<void> {
  const authUser = (request as Request & { authUser?: { id: string } }).authUser;
  if (!authUser) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const user = await User.findById(authUser.id).select('_id name email role shopId');
  if (!user) {
    response.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }
  response.json({ user: toPublicUser(user) });
}
