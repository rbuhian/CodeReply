# Validation Testing Quick Start

**Author**: Bernadette (API Engineer)
**Date**: April 3, 2026
**Purpose**: Quick reference for testing the Zod validation schemas

---

## ⚡ Quick Test (30 seconds)

```bash
cd /mnt/e/Program/CodeReply/src/backend

# Run all 141 validation tests
npm test -- --testPathPattern=validation
```

**Expected Output:**
```
PASS unit tests/unit/validation/deviceSchemas.test.ts (13.082 s)
PASS unit tests/unit/validation/messageSchemas.test.ts (14.422 s)
PASS unit tests/unit/validation/authSchemas.test.ts (25.383 s)

Test Suites: 3 passed, 3 total
Tests:       141 passed, 141 total
Time:        30.444 s
```

✅ **All tests passing = Validation layer ready for API development**

---

## 📝 What Was Tested

### ✅ Device Validation (54 tests)
- Registration token format: `cr_reg_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
- Device name constraints
- E.164 phone numbers for SIM cards
- Android/app version formats
- Heartbeat status, battery, signal strength
- Query parameters (pagination, sorting)

### ✅ Message Validation (52 tests)
- E.164 phone number validation (using libphonenumber-js)
- 918-character SMS limit (6 segments)
- Webhook URL validation
- 5KB metadata limit
- TTL ranges (60-86400 seconds)
- Priority levels (LOW/NORMAL/HIGH)
- Batch limits (max 100 messages)

### ✅ Auth Validation (35 tests)
- API key format: `cr_live_*` or `cr_test_*`
- Password strength requirements
- Email validation
- Permission arrays
- Token expiration dates

---

## 🔍 Run Specific Tests

```bash
# Device validation only (54 tests)
npm test -- tests/unit/validation/deviceSchemas.test.ts

# Message validation only (52 tests)
npm test -- tests/unit/validation/messageSchemas.test.ts

# Auth validation only (35 tests)
npm test -- tests/unit/validation/authSchemas.test.ts
```

---

## 🛠️ Advanced Testing

```bash
# Watch mode (auto-rerun on changes)
npm test -- --testPathPattern=validation --watch

# Verbose output (see each test name)
npm test -- --testPathPattern=validation --verbose

# Coverage report
npm test -- --testPathPattern=validation --coverage
```

---

## 📂 Files Created

```
src/backend/
├── validation/                           # ← Validation schemas
│   ├── deviceSchemas.ts                 # Device registration & management
│   ├── messageSchemas.ts                # SMS message sending & querying
│   └── authSchemas.ts                   # API keys & authentication
│
├── middleware/
│   └── validate.ts                      # ← Express middleware
│
└── tests/
    └── unit/validation/                 # ← Test files
        ├── deviceSchemas.test.ts        # 54 tests
        ├── messageSchemas.test.ts       # 52 tests
        └── authSchemas.test.ts          # 35 tests
```

---

## 🎯 How to Use Validation in API Routes

```typescript
import { validate } from '../middleware/validate';
import { SendMessageSchema } from '../validation/messageSchemas';

// Apply validation to route
router.post(
  '/api/v1/messages',
  validate(SendMessageSchema, 'body'),
  async (req: ValidatedRequest<SendMessageInput>, res) => {
    // req.validated is now type-safe and validated!
    const { to, body, priority } = req.validated;

    // Send message logic here...
  }
);
```

**What happens:**
1. Request comes in with JSON body
2. Validation middleware runs `SendMessageSchema.parse(req.body)`
3. If valid → `req.validated` contains validated data, continues to handler
4. If invalid → Returns 400 error with detailed validation errors

**Example error response:**
```json
{
  "error": "Validation Error",
  "message": "The request contains invalid data",
  "errors": [
    {
      "field": "to",
      "message": "Phone number must be in E.164 format (e.g., +639171234567)"
    },
    {
      "field": "body",
      "message": "Message body is required"
    }
  ],
  "timestamp": "2026-04-03T12:00:00.000Z"
}
```

---

## 🚨 Troubleshooting

### Tests won't run

```bash
# Make sure you're in the backend directory
cd /mnt/e/Program/CodeReply/src/backend

# Reinstall dependencies
npm install

# Try again
npm test -- --testPathPattern=validation
```

### "Cannot find module" error

```bash
# Check TypeScript compilation
npx tsc --noEmit

# If errors, fix them first
```

### Tests timeout

```bash
# Increase timeout
npm test -- --testPathPattern=validation --testTimeout=60000
```

---

## ✅ Success Criteria

All validation tests passing means:

✅ Phone number validation works (E.164 format)
✅ Message length limits enforced (918 chars)
✅ Metadata size limits enforced (5KB)
✅ Device registration validation complete
✅ API key format validation working
✅ Password strength requirements enforced
✅ All edge cases covered

**Ready for**: API endpoint implementation (next critical task)

---

## 📖 Full Documentation

For complete testing instructions including backend server setup, see:
- `/docs/TESTING_WITHOUT_DOCKER.md` - Step 9: Test Validation Schemas

---

**Questions?** The validation schemas are fully tested and documented. Next step is to implement the API key authentication middleware (Sheldon's task).
