# Authentication Middleware Guide

**Author:** Bernadette (API Engineer)
**Date:** April 3, 2026
**Status:** Complete - 39 Tests Passing

## Overview

This guide covers the authentication, permission checking, and rate limiting middleware for the CodeReply API. These middleware components work together to secure API endpoints and ensure proper access control.

## Table of Contents

- [Quick Start](#quick-start)
- [Authentication Middleware](#authentication-middleware)
- [Permission Checking](#permission-checking)
- [Rate Limiting](#rate-limiting)
- [Common Usage Patterns](#common-usage-patterns)
- [Error Handling](#error-handling)
- [Testing](#testing)

---

## Quick Start

### Basic Protected Route

```typescript
import { authenticate } from '../middleware/authenticate';
import { requirePermissions } from '../middleware/requirePermissions';
import { rateLimit } from '../middleware/rateLimit';

// Simple authenticated route
router.get('/devices', authenticate, async (req: AuthenticatedRequest, res) => {
  const { subscriber } = req;
  const devices = await getDevicesBySubscriber(subscriber.id);
  res.json(devices);
});

// With permission checking
router.post(
  '/messages',
  authenticate,
  requirePermissions(['messages:write']),
  async (req: AuthenticatedRequest, res) => {
    // User has messages:write permission
    const message = await createMessage(req.subscriber.id, req.body);
    res.json(message);
  }
);

// With rate limiting
router.post(
  '/messages',
  authenticate,
  rateLimit(),
  requirePermissions(['messages:write']),
  async (req: AuthenticatedRequest, res) => {
    // Rate limited based on subscriber's plan
    const message = await createMessage(req.subscriber.id, req.body);
    res.json(message);
  }
);
```

---

## Authentication Middleware

### Purpose

The `authenticate` middleware validates API keys and injects subscriber context into requests.

### How It Works

1. Extracts API key from `Authorization` header
2. Validates format: `Bearer cr_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` or `Bearer cr_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
3. Hashes the API key using SHA-256
4. Looks up the hashed key in the database
5. Checks if the API key is active
6. Injects subscriber context into `req.subscriber`
7. Updates `last_used_at` timestamp (async, non-blocking)

### API Key Format

API keys must follow this format:
- **Prefix**: `cr_live_` (production) or `cr_test_` (testing)
- **Secret**: 32 alphanumeric characters
- **Total Length**: 40 characters (8 char prefix + 32 char secret)

Example:
```
cr_live_abcd1234efgh5678ijkl9012mnop3456
```

### Request Header

```http
Authorization: Bearer cr_live_abcd1234efgh5678ijkl9012mnop3456
```

### Subscriber Context

After successful authentication, `req.subscriber` contains:

```typescript
interface Subscriber {
  id: string;          // Subscriber ID from database
  name: string;        // Subscriber name
  email: string;       // Subscriber email
  plan: string;        // Plan type: 'starter', 'professional', 'enterprise'
  apiKeyId: string;    // API key ID for rate limiting
}
```

### Usage Example

```typescript
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';

router.get('/devices', authenticate, async (req: AuthenticatedRequest, res) => {
  // req.subscriber is guaranteed to exist
  console.log(req.subscriber.id);    // "sub-123"
  console.log(req.subscriber.plan);  // "professional"

  const devices = await db.query(
    'SELECT * FROM devices WHERE subscriber_id = $1',
    [req.subscriber.id]
  );

  res.json({ devices });
});
```

### Error Responses

#### Missing Authorization Header

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "Unauthorized",
  "message": "Missing or invalid Authorization header. Expected: Bearer cr_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "timestamp": "2026-04-03T10:30:00.000Z"
}
```

#### Invalid API Key

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "Unauthorized",
  "message": "Invalid API key",
  "timestamp": "2026-04-03T10:30:00.000Z"
}
```

#### Inactive API Key

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "error": "Unauthorized",
  "message": "API key has been revoked or deactivated",
  "timestamp": "2026-04-03T10:30:00.000Z"
}
```

### Optional Authentication

Use `optionalAuthenticate` for endpoints that work with or without authentication:

```typescript
import { optionalAuthenticate, AuthenticatedRequest } from '../middleware/authenticate';

router.get('/public-data', optionalAuthenticate, async (req: AuthenticatedRequest, res) => {
  if (req.subscriber) {
    // Return personalized data
    return res.json({ data: getPersonalizedData(req.subscriber.id) });
  }

  // Return public data
  res.json({ data: getPublicData() });
});
```

---

## Permission Checking

### Purpose

The `requirePermissions` middleware ensures subscribers have the necessary permissions based on their plan.

### Available Permissions

```typescript
type Permission =
  | 'messages:read'
  | 'messages:write'
  | 'devices:read'
  | 'devices:write'
  | 'api-keys:read'
  | 'api-keys:write';
```

### Plan-Based Permissions

| Permission | Starter | Professional | Enterprise |
|------------|---------|--------------|------------|
| messages:read | ✅ | ✅ | ✅ |
| messages:write | ✅ | ✅ | ✅ |
| devices:read | ✅ | ✅ | ✅ |
| devices:write | ✅ | ✅ | ✅ |
| api-keys:read | ❌ | ✅ | ✅ |
| api-keys:write | ❌ | ✅ | ✅ |

### Usage Example

```typescript
import { authenticate } from '../middleware/authenticate';
import { requirePermissions } from '../middleware/requirePermissions';

// Require single permission
router.post(
  '/messages',
  authenticate,
  requirePermissions(['messages:write']),
  async (req, res) => {
    // User has messages:write permission
  }
);

// Require multiple permissions
router.post(
  '/api-keys',
  authenticate,
  requirePermissions(['api-keys:write', 'api-keys:read']),
  async (req, res) => {
    // User has BOTH permissions
  }
);
```

### Error Response

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "Forbidden",
  "message": "Insufficient permissions to access this resource",
  "required": ["api-keys:write"],
  "timestamp": "2026-04-03T10:30:00.000Z"
}
```

### Ownership Validation

Use `requireOwnership` to ensure subscribers can only access their own resources:

```typescript
import { authenticate } from '../middleware/authenticate';
import { requireOwnership } from '../middleware/requirePermissions';

router.get(
  '/subscribers/:subscriberId/devices',
  authenticate,
  requireOwnership,
  async (req, res) => {
    // req.params.subscriberId matches req.subscriber.id
    const devices = await getDevices(req.params.subscriberId);
    res.json({ devices });
  }
);
```

**How it works:**
- Checks if `req.params.subscriberId` exists
- Compares with `req.subscriber.id`
- Returns 403 if they don't match
- Passes through if no `subscriberId` in params

**Error Response:**

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json

{
  "error": "Forbidden",
  "message": "You can only access your own resources",
  "timestamp": "2026-04-03T10:30:00.000Z"
}
```

---

## Rate Limiting

### Purpose

The `rateLimit` middleware prevents API abuse by limiting requests per API key based on plan.

### Plan-Based Rate Limits

| Plan | Requests | Window |
|------|----------|--------|
| Starter | 100 | 60 seconds |
| Professional | 1,000 | 60 seconds |
| Enterprise | 10,000 | 60 seconds |

### How It Works

1. Uses Redis sliding window algorithm
2. Creates key: `ratelimit:apiKeyId:windowStart`
3. Increments counter for current window
4. Sets expiry on first request
5. Checks if limit exceeded
6. Returns rate limit headers

### Usage Example

```typescript
import { authenticate } from '../middleware/authenticate';
import { rateLimit } from '../middleware/rateLimit';

// Use plan-based rate limits
router.post('/messages', authenticate, rateLimit(), async (req, res) => {
  // Rate limited based on subscriber's plan
});

// Use custom rate limits
router.post(
  '/expensive-operation',
  authenticate,
  rateLimit({ maxRequests: 10, windowSeconds: 60 }),
  async (req, res) => {
    // Limited to 10 requests per minute
  }
);
```

### Response Headers

Every successful request includes rate limit headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1735908660
```

### Error Response

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1735908660
Retry-After: 45

{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Maximum 1000 requests per 60 seconds.",
  "limit": 1000,
  "windowSeconds": 60,
  "retryAfter": 45,
  "timestamp": "2026-04-03T10:30:00.000Z"
}
```

### Graceful Degradation

If Redis is unavailable:
- Error is logged
- Request is allowed to proceed
- No rate limiting is applied

This ensures the API remains available even if Redis goes down.

---

## Common Usage Patterns

### Pattern 1: Simple CRUD Endpoint

```typescript
router.get('/devices', authenticate, async (req: AuthenticatedRequest, res) => {
  const devices = await getDevices(req.subscriber.id);
  res.json({ devices });
});

router.post(
  '/devices',
  authenticate,
  requirePermissions(['devices:write']),
  async (req: AuthenticatedRequest, res) => {
    const device = await createDevice(req.subscriber.id, req.body);
    res.json({ device });
  }
);
```

### Pattern 2: Protected Resource with Ownership

```typescript
router.get(
  '/subscribers/:subscriberId/devices/:deviceId',
  authenticate,
  requireOwnership,
  async (req: AuthenticatedRequest, res) => {
    const device = await getDevice(
      req.params.subscriberId,
      req.params.deviceId
    );
    res.json({ device });
  }
);
```

### Pattern 3: Rate-Limited Endpoint

```typescript
router.post(
  '/messages',
  authenticate,
  rateLimit(),
  requirePermissions(['messages:write']),
  async (req: AuthenticatedRequest, res) => {
    const message = await sendMessage(req.subscriber.id, req.body);
    res.json({ message });
  }
);
```

### Pattern 4: Expensive Operation with Custom Rate Limit

```typescript
router.post(
  '/bulk-import',
  authenticate,
  rateLimit({ maxRequests: 5, windowSeconds: 3600 }), // 5 per hour
  requirePermissions(['devices:write']),
  async (req: AuthenticatedRequest, res) => {
    const result = await bulkImportDevices(req.subscriber.id, req.body);
    res.json({ result });
  }
);
```

### Pattern 5: Admin-Only Endpoint

```typescript
router.get(
  '/admin/api-keys',
  authenticate,
  requirePermissions(['api-keys:read']), // Only professional+ plans
  async (req: AuthenticatedRequest, res) => {
    const apiKeys = await getApiKeys(req.subscriber.id);
    res.json({ apiKeys });
  }
);
```

### Pattern 6: Full Protection Stack

```typescript
router.post(
  '/subscribers/:subscriberId/messages',
  authenticate,              // Validate API key
  requireOwnership,          // Check subscriberId matches
  rateLimit(),              // Apply rate limiting
  requirePermissions(['messages:write']), // Check permissions
  async (req: AuthenticatedRequest, res) => {
    // Fully protected endpoint
    const message = await createMessage(
      req.params.subscriberId,
      req.body
    );
    res.json({ message });
  }
);
```

---

## Error Handling

### Error Response Format

All authentication/authorization errors follow this format:

```typescript
interface ErrorResponse {
  error: string;           // Error type
  message: string;         // Human-readable message
  timestamp: string;       // ISO 8601 timestamp
  required?: string[];     // Required permissions (403 only)
  limit?: number;          // Rate limit (429 only)
  windowSeconds?: number;  // Rate limit window (429 only)
  retryAfter?: number;     // Seconds to wait (429 only)
}
```

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 401 | Unauthorized | Missing, invalid, or inactive API key |
| 403 | Forbidden | Insufficient permissions or ownership check failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Database error or unexpected error |

### Security Considerations

1. **API keys are never exposed in errors**
   - Only first 12 characters logged (e.g., "cr_live_abcd...")
   - Full key never appears in responses

2. **SHA-256 hashing**
   - API keys are hashed before database lookup
   - Only hashes are stored in database

3. **Timing attack prevention**
   - All validation paths take similar time
   - No early returns that leak information

4. **Rate limiting degradation**
   - If Redis is down, requests are allowed
   - Prevents total outage due to Redis failure

---

## Testing

### Running Tests

```bash
# Run all middleware tests
npm test -- --testPathPattern=middleware

# Run specific test file
npm test -- tests/unit/middleware/authenticate.test.ts
npm test -- tests/unit/middleware/requirePermissions.test.ts
```

### Test Coverage

#### authenticate.test.ts (18 tests)

- Valid API keys (live and test)
- Missing Authorization header
- Invalid Authorization format
- Malformed API keys (wrong prefix, length, characters)
- API key not found in database
- Inactive API keys
- Database errors and timeouts
- Security (hashing, no key exposure)
- Optional authentication

#### requirePermissions.test.ts (21 tests)

- Starter plan permissions (allow/deny)
- Professional plan permissions
- Enterprise plan permissions
- Multiple permission requirements
- Ownership validation (match/mismatch)
- Error handling

### Test Status

✅ **39 tests passing** (April 3, 2026)

### Manual Testing

#### Test Valid Authentication

```bash
# Create test API key in database
psql -U codereply -d codereply_db -c "
INSERT INTO api_keys (subscriber_id, key_hash, key_prefix, name, is_active)
VALUES (
  'sub-123',
  '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
  'cr_live_xxxx',
  'Test Key',
  true
);
"

# Test endpoint
curl -X GET http://localhost:3000/api/v1/test/authenticated \
  -H "Authorization: Bearer cr_live_passwordpasswordpasswordpassword"
```

#### Test Rate Limiting

```bash
# Make 100+ requests to exceed starter plan limit
for i in {1..105}; do
  curl -X GET http://localhost:3000/api/v1/test/rate-limited \
    -H "Authorization: Bearer cr_live_passwordpasswordpasswordpassword"
  echo "Request $i"
done
```

#### Test Permission Denied

```bash
# Try to access api-keys endpoint with starter plan
curl -X GET http://localhost:3000/api/v1/subscribers/sub-123/api-keys \
  -H "Authorization: Bearer cr_live_starterkeystarterkeystarterkey"
```

---

## Next Steps

Now that authentication middleware is complete, you can:

1. **Implement Registration Token Endpoint**
   - POST /api/v1/registration/tokens
   - Generate one-time tokens for device registration

2. **Implement Device Registration Endpoint**
   - POST /api/v1/devices/register
   - Use registration tokens to create devices

3. **Add Authentication to Existing Endpoints**
   - Update all protected routes to use authentication
   - Add appropriate permission checks

4. **Implement API Key Management Endpoints**
   - POST /api/v1/subscribers/:subscriberId/api-keys (create)
   - GET /api/v1/subscribers/:subscriberId/api-keys (list)
   - DELETE /api/v1/subscribers/:subscriberId/api-keys/:keyId (revoke)

---

## Reference

### Files

- `src/backend/middleware/authenticate.ts` - Authentication middleware (270 lines)
- `src/backend/middleware/requirePermissions.ts` - Permission checking (220 lines)
- `src/backend/middleware/rateLimit.ts` - Rate limiting (200 lines)
- `tests/unit/middleware/authenticate.test.ts` - Authentication tests (400+ lines, 18 tests)
- `tests/unit/middleware/requirePermissions.test.ts` - Permission tests (380+ lines, 21 tests)

### Dependencies

- **express** - Web framework
- **crypto** - SHA-256 hashing
- **pg** - PostgreSQL database client
- **ioredis** - Redis client for rate limiting
- **winston** - Logging

### Database Tables

- `subscribers` - Subscriber information (id, name, email, plan)
- `api_keys` - API key records (id, subscriber_id, key_hash, is_active, last_used_at)

### Redis Keys

- `ratelimit:apiKeyId:windowStart` - Rate limit counters

---

**For questions or issues, contact the backend team.**
