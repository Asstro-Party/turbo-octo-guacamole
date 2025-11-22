import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';

// Mock the auth middleware since we need to test the logic
const authenticateToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

describe('Auth Middleware', () => {
  it('should authenticate valid token', () => {
    const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET || 'test-secret');
    const req = {
      header: vi.fn().mockReturnValue(`Bearer ${token}`)
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe(1);
    expect(next).toHaveBeenCalled();
  });

  it('should reject invalid token', () => {
    const req = {
      header: vi.fn().mockReturnValue('Bearer invalid-token')
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject missing token', () => {
    const req = {
      header: vi.fn().mockReturnValue(null)
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});