# CodeReply SDKs

Official client libraries for integrating with the CodeReply SMS gateway API.

## Overview

The CodeReply SDKs provide a simple, developer-friendly way to send SMS messages from your applications. Available in multiple languages:

- **Node.js/TypeScript** (`nodejs/`)
- **Python** (`python/`)
- **PHP** (`php/`)

## Quick Start

### Node.js/TypeScript

```typescript
import { CodeReplyClient } from '@codereply/sdk';

const client = new CodeReplyClient({
  apiKey: 'cr_live_xxxxxxxxxxxxxxxx'
});

const message = await client.messages.send({
  to: '+639171234567',
  body: 'Your OTP is 123456. Valid for 5 minutes.',
  webhookUrl: 'https://myapp.com/webhooks/sms'
});

console.log(message.messageId); // msg-uuid-1234
console.log(message.status);    // QUEUED
```

### Python

```python
from codereply import CodeReplyClient

client = CodeReplyClient(api_key='cr_live_xxxxxxxxxxxxxxxx')

message = client.messages.send(
    to='+639171234567',
    body='Your OTP is 123456. Valid for 5 minutes.',
    webhook_url='https://myapp.com/webhooks/sms'
)

print(message.message_id)  # msg-uuid-1234
print(message.status)      # QUEUED
```

### PHP

```php
<?php
require_once 'vendor/autoload.php';

use CodeReply\Client;

$client = new Client(['api_key' => 'cr_live_xxxxxxxxxxxxxxxx']);

$message = $client->messages->send([
    'to' => '+639171234567',
    'body' => 'Your OTP is 123456. Valid for 5 minutes.',
    'webhook_url' => 'https://myapp.com/webhooks/sms'
]);

echo $message->messageId; // msg-uuid-1234
echo $message->status;    // QUEUED
```

## Installation

### Node.js

```bash
npm install @codereply/sdk
# or
yarn add @codereply/sdk
```

### Python

```bash
pip install codereply
```

### PHP

```bash
composer require codereply/sdk
```

## SDK Structure

Each SDK directory contains:

```
sdk/
├── nodejs/
│   ├── src/
│   │   ├── client.ts
│   │   ├── resources/
│   │   │   ├── messages.ts
│   │   │   ├── devices.ts
│   │   │   └── webhooks.ts
│   │   ├── types/
│   │   └── errors.ts
│   ├── tests/
│   ├── package.json
│   └── README.md
├── python/
│   ├── codereply/
│   │   ├── client.py
│   │   ├── resources/
│   │   │   ├── messages.py
│   │   │   ├── devices.py
│   │   │   └── webhooks.py
│   │   └── errors.py
│   ├── tests/
│   ├── setup.py
│   └── README.md
└── php/
    ├── src/
    │   ├── Client.php
    │   ├── Resources/
    │   │   ├── Messages.php
    │   │   ├── Devices.php
    │   │   └── Webhooks.php
    │   └── Exceptions/
    ├── tests/
    ├── composer.json
    └── README.md
```

## Core Features

All SDKs provide:

1. **Message Operations**
   - Send SMS messages
   - Get message status
   - List messages with filtering
   - Cancel queued messages

2. **Device Operations** (for operators)
   - List gateway devices
   - Get device details
   - Update device configuration

3. **Webhook Operations**
   - Register webhook endpoints
   - List webhooks
   - Delete webhooks
   - Verify webhook signatures

4. **Error Handling**
   - Structured error objects
   - Detailed error messages
   - HTTP status codes
   - Retry logic for network errors

5. **Authentication**
   - Automatic API key handling
   - JWT token management
   - Token refresh

## API Methods

### Messages

```typescript
// Send a message
await client.messages.send({
  to: '+639171234567',
  body: 'Your verification code is 123456',
  webhookUrl: 'https://myapp.com/webhook',
  metadata: { userId: 'user_123', purpose: 'otp' }
});

// Get message status
const message = await client.messages.get('msg-uuid-1234');

// List messages
const messages = await client.messages.list({
  status: 'DELIVERED',
  limit: 50,
  offset: 0
});

// Cancel a queued message
await client.messages.cancel('msg-uuid-1234');
```

### Devices (Operator only)

```typescript
// List all devices
const devices = await client.devices.list();

// Get device details
const device = await client.devices.get('device-uuid-1');

// Update device
await client.devices.update('device-uuid-1', {
  name: 'Gateway PH-1'
});
```

### Webhooks

```typescript
// Register webhook
await client.webhooks.create({
  url: 'https://myapp.com/webhooks/sms',
  events: ['message.sent', 'message.delivered', 'message.failed']
});

// List webhooks
const webhooks = await client.webhooks.list();

// Delete webhook
await client.webhooks.delete('webhook-uuid-1');

// Verify webhook signature (in your webhook handler)
import { verifyWebhookSignature } from '@codereply/sdk';

app.post('/webhooks/sms', (req, res) => {
  const signature = req.headers['x-codereply-signature'];
  const timestamp = req.headers['x-codereply-timestamp'];
  const payload = JSON.stringify(req.body);

  const isValid = verifyWebhookSignature(
    payload,
    signature,
    timestamp,
    process.env.WEBHOOK_SECRET
  );

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  // Process webhook...
});
```

## Error Handling

All SDKs use consistent error handling:

```typescript
import { CodeReplyError } from '@codereply/sdk';

try {
  await client.messages.send({
    to: 'invalid-number',
    body: 'Test'
  });
} catch (error) {
  if (error instanceof CodeReplyError) {
    console.log(error.code);     // INVALID_PHONE_NUMBER
    console.log(error.message);  // The 'to' field must be valid E.164
    console.log(error.status);   // 400
    console.log(error.details);  // Additional error details
  }
}
```

Common error codes:
- `INVALID_PHONE_NUMBER` (400)
- `BODY_TOO_LONG` (400)
- `UNAUTHORIZED` (401)
- `QUOTA_EXCEEDED` (429)
- `RATE_LIMITED` (429)
- `NO_GATEWAY_AVAILABLE` (503)

## Configuration Options

```typescript
const client = new CodeReplyClient({
  apiKey: 'cr_live_xxxxxxxx',
  baseUrl: 'https://api.codereply.app/v1',  // Optional
  timeout: 10000,                            // Optional (ms)
  retryAttempts: 3,                          // Optional
  retryDelay: 1000                           // Optional (ms)
});
```

## Development

### Building SDKs

Each SDK has its own build process:

**Node.js:**
```bash
cd nodejs
npm install
npm run build
npm test
```

**Python:**
```bash
cd python
pip install -e .
pytest
```

**PHP:**
```bash
cd php
composer install
./vendor/bin/phpunit
```

### Testing

All SDKs include:
- Unit tests for all methods
- Integration tests against mock server
- Example usage scripts

### Publishing

**Node.js:**
```bash
npm publish
```

**Python:**
```bash
python setup.py sdist bdist_wheel
twine upload dist/*
```

**PHP:**
```bash
# Packagist automatically syncs from GitHub releases
```

## AI Agent Support

Use **@bernadette** for SDK development:

```
@bernadette create the Node.js SDK with message operations
@bernadette implement webhook signature verification
@bernadette add error handling with retry logic
@bernadette write comprehensive SDK tests
```

## Documentation

Each SDK includes:
- README with quick start guide
- API reference documentation
- Code examples
- Webhook handling guide
- Error handling guide

## Next Steps

1. Review `CodeReply_Technical_Document.md` section 6 (Subscriber Integration)
2. Use @bernadette to implement SDK for your preferred language
3. Add comprehensive error handling
4. Write tests with @amy
5. Create example applications
6. Publish to package registries

## Resources

- [REST API Documentation](../../docs/API_REFERENCE.md)
- [Webhook Guide](../../docs/WEBHOOK_GUIDE.md)
- [Error Codes Reference](../../docs/ERROR_CODES.md)
