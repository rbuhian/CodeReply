# CodeReply Web Dashboard

The web interface for managing the CodeReply SMS gateway platform.

## Overview

This is the web dashboard that provides:
- **Subscriber Interface**: View messages, manage API keys, configure webhooks
- **Operator Panel**: Manage gateway devices, view analytics, monitor system health
- **Real-time Updates**: Live status of devices and message delivery

## Technology Stack

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand or Redux Toolkit
- **Routing**: React Router v6
- **API Client**: Axios
- **Real-time**: Socket.IO client
- **Charts**: Recharts
- **Forms**: React Hook Form + Zod
- **UI Components**: Shadcn/ui (Radix UI + Tailwind)

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**

   Create `.env.local`:
   ```env
   VITE_API_BASE_URL=http://localhost:3000/v1
   VITE_WS_URL=ws://localhost:3000
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

   Open http://localhost:5173

## Project Structure

```
web/
├── src/
│   ├── components/
│   │   ├── common/           # Reusable UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   └── Badge.tsx
│   │   ├── layout/           # Layout components
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Footer.tsx
│   │   ├── messages/         # Message-related components
│   │   │   ├── MessageTable.tsx
│   │   │   ├── MessageDetails.tsx
│   │   │   └── MessageFilters.tsx
│   │   ├── devices/          # Device-related components
│   │   │   ├── DeviceCard.tsx
│   │   │   ├── DeviceStatus.tsx
│   │   │   └── DeviceList.tsx
│   │   └── charts/           # Data visualization
│   │       ├── UsageChart.tsx
│   │       └── SuccessRateChart.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx     # Main dashboard
│   │   ├── Messages.tsx      # Message log viewer
│   │   ├── Devices.tsx       # Device management
│   │   ├── ApiKeys.tsx       # API key management
│   │   ├── Webhooks.tsx      # Webhook configuration
│   │   └── Settings.tsx      # Account settings
│   ├── hooks/
│   │   ├── useMessages.ts    # Message data fetching
│   │   ├── useDevices.ts     # Device data fetching
│   │   ├── useAuth.ts        # Authentication
│   │   └── useWebSocket.ts   # Real-time updates
│   ├── services/
│   │   ├── api.ts            # API client setup
│   │   └── websocket.ts      # WebSocket client
│   ├── store/
│   │   ├── authStore.ts
│   │   ├── messagesStore.ts
│   │   └── devicesStore.ts
│   ├── types/
│   │   └── index.ts          # TypeScript types
│   ├── utils/
│   │   ├── formatters.ts     # Date, phone formatting
│   │   └── validators.ts     # Form validation
│   ├── App.tsx
│   └── main.tsx
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## Key Features

### 1. Dashboard Page
- Total messages sent (today/week/month)
- Success rate percentage
- Active gateway devices count
- Recent activity feed
- Quick actions

### 2. Message Log Viewer
- Paginated table of all messages
- Filters: status, date range, phone number
- Search by message ID or recipient
- Status badges (color-coded)
- Export to CSV

### 3. Device Management
- List of all gateway devices
- Real-time status indicators
- Device info (SIM carrier, signal strength)
- Messages sent per device
- Success rate per device
- Remove device action

### 4. API Key Management
- Create new API keys with labels
- Copy to clipboard
- Revoke keys
- View last used timestamp
- Key prefix display (full key shown once at creation)

### 5. Webhook Configuration
- Set webhook URL
- Test webhook (send test payload)
- View webhook secret
- Delivery history
- Retry failed webhooks

## Development

### Running the App

```bash
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Testing

```bash
# Run tests
npm test

# With coverage
npm run test:coverage

# E2E tests (Playwright)
npm run test:e2e
```

### Code Quality

```bash
# Lint
npm run lint

# Format
npm run format

# Type check
npm run type-check
```

## Styling

Using Tailwind CSS with custom design system:

```tsx
// Example component
export function MessageCard({ message }: { message: Message }) {
  return (
    <Card className="p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">
          {formatPhoneNumber(message.to)}
        </span>
        <Badge variant={getStatusVariant(message.status)}>
          {message.status}
        </Badge>
      </div>
      <p className="mt-2 text-gray-900">{message.body}</p>
      <span className="mt-2 text-xs text-gray-500">
        {formatDate(message.queuedAt)}
      </span>
    </Card>
  );
}
```

## State Management

Using Zustand for simple, performant state:

```typescript
// Example store
import create from 'zustand';

interface MessagesState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  fetchMessages: () => Promise<void>;
  sendMessage: (data: SendMessageRequest) => Promise<void>;
}

export const useMessagesStore = create<MessagesState>((set) => ({
  messages: [],
  isLoading: false,
  error: null,

  fetchMessages: async () => {
    set({ isLoading: true });
    try {
      const messages = await api.messages.list();
      set({ messages, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  },

  sendMessage: async (data) => {
    const message = await api.messages.send(data);
    set((state) => ({
      messages: [message, ...state.messages]
    }));
  }
}));
```

## API Integration

```typescript
// services/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// API methods
export const messagesApi = {
  list: async (params?: ListParams) => {
    const { data } = await api.get('/messages', { params });
    return data.data;
  },

  send: async (message: SendMessageRequest) => {
    const { data } = await api.post('/messages', message);
    return data.data;
  },

  get: async (id: string) => {
    const { data } = await api.get(`/messages/${id}`);
    return data.data;
  }
};
```

## Real-time Updates

```typescript
// hooks/useWebSocket.ts
import { useEffect } from 'react';
import { io } from 'socket.io-client';

export function useWebSocket() {
  useEffect(() => {
    const socket = io(import.meta.env.VITE_WS_URL);

    socket.on('message.updated', (message) => {
      // Update message in store
      useMessagesStore.getState().updateMessage(message);
    });

    socket.on('device.status', (device) => {
      // Update device status in store
      useDevicesStore.getState().updateDevice(device);
    });

    return () => {
      socket.disconnect();
    };
  }, []);
}
```

## Accessibility

- Keyboard navigation support
- ARIA labels on all interactive elements
- Sufficient color contrast (WCAG AA)
- Focus indicators
- Screen reader friendly
- Semantic HTML

## Browser Support

- Chrome/Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- No IE11 support

## AI Agent Support

Use **@penny** for all frontend development:

```
@penny create the message log viewer with filtering
@penny design the device status dashboard
@penny implement the API key management UI
@penny add charts for message delivery statistics
@penny make this component more user-friendly
```

## Next Steps

1. Review `CodeReply_Technical_Document.md`
2. Use @penny to design and implement UI components
3. Integrate with backend API
4. Add real-time updates via WebSocket
5. Write component tests with @amy
6. Optimize performance and bundle size

## Resources

- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Shadcn/ui](https://ui.shadcn.com)
- [React Router](https://reactrouter.com)
- [Recharts](https://recharts.org)
