# CodeReply Development Agents

This document describes the specialized Claude agents available for the CodeReply project. Each agent is named after a character from The Big Bang Theory and has specific expertise areas.

## Available Agents

### 1. Sheldon - Backend Architect
**Location**: `.claude/agents/sheldon.md`

**Expertise**:
- Backend architecture (Node.js/Python)
- WebSocket implementation
- Message queue systems (Redis + BullMQ)
- REST API design
- Authentication & security (JWT, API keys, HMAC)

**Use When**:
- Designing or implementing backend API endpoints
- Setting up WebSocket communication
- Implementing message queue and dispatcher logic
- Building authentication and security features
- Creating webhook delivery systems

**Example Usage**:
```
@sheldon help me implement the message queue dispatcher
@sheldon design the WebSocket protocol for device communication
```

---

### 2. Leonard - Android Developer
**Location**: `.claude/agents/leonard.md`

**Expertise**:
- Kotlin Android development
- MVVM + Clean Architecture
- SMS integration (SmsManager API)
- WebSocket client implementation
- Foreground services

**Use When**:
- Building the Android gateway application
- Implementing SMS sending functionality
- Creating WebSocket client for real-time communication
- Designing Android app architecture
- Handling Android permissions and lifecycle

**Example Usage**:
```
@leonard create the GatewayService foreground service
@leonard implement the SmsDispatcher with delivery tracking
```

---

### 3. Penny - Frontend Developer & UX Designer
**Location**: `.claude/agents/penny.md`

**Expertise**:
- React/Vue frontend development
- User experience design
- Dashboard and admin panel creation
- Data visualization
- Responsive web design

**Use When**:
- Building the subscriber web dashboard
- Creating operator admin panel
- Designing UI/UX for web interfaces
- Implementing charts and data visualizations
- Making the application user-friendly

**Example Usage**:
```
@penny create the message log viewer interface
@penny design the device status dashboard
```

---

### 4. Howard - DevOps & Infrastructure Engineer
**Location**: `.claude/agents/howard.md`

**Expertise**:
- Cloud infrastructure (AWS, Railway, Render)
- Docker and containerization
- CI/CD pipelines (GitHub Actions)
- Monitoring and logging
- Database management and backups

**Use When**:
- Setting up deployment infrastructure
- Creating Docker configurations
- Building CI/CD pipelines
- Implementing monitoring and alerting
- Managing secrets and environment variables

**Example Usage**:
```
@howard create the Docker Compose setup for local development
@howard set up GitHub Actions for automated deployment
```

---

### 5. Raj - Database Architect & Data Engineer
**Location**: `.claude/agents/raj.md`

**Expertise**:
- PostgreSQL schema design
- Query optimization and indexing
- Data modeling and migrations
- Analytics and reporting queries
- Backup and recovery strategies

**Use When**:
- Designing database schemas
- Optimizing slow queries
- Creating database migrations
- Building analytics queries
- Implementing data integrity constraints

**Example Usage**:
```
@raj design the database schema for messages and devices
@raj optimize this query for better performance
```

---

### 6. Amy - QA Engineer & Testing Specialist
**Location**: `.claude/agents/amy.md`

**Expertise**:
- Test strategy and planning
- Unit testing (Jest, JUnit, MockK)
- Integration and E2E testing
- Performance testing
- Security testing

**Use When**:
- Writing unit tests for code
- Creating integration test suites
- Designing test strategies
- Setting up CI/CD test automation
- Performing load and security testing

**Example Usage**:
```
@amy write unit tests for the MessageService
@amy create an E2E test for the complete message sending flow
```

---

### 7. Bernadette - API Integration & SDK Specialist
**Location**: `.claude/agents/bernadette.md`

**Expertise**:
- REST API implementation
- SDK development (Node.js, Python, PHP)
- Webhook systems
- API documentation
- Developer experience optimization

**Use When**:
- Implementing REST API endpoints
- Creating client SDKs
- Building webhook delivery mechanisms
- Writing API documentation
- Designing integration patterns

**Example Usage**:
```
@bernadette implement the POST /messages endpoint
@bernadette create the Node.js SDK for CodeReply
```

---

## How to Use Agents

### 1. Mention an Agent
Simply type `@` followed by the agent name (case-insensitive):
```
@sheldon
@leonard
@penny
```

### 2. Ask for Help
Describe what you need help with:
```
@sheldon I need help implementing the WebSocket dispatcher that routes messages to Android devices

@leonard Can you create the foreground service that maintains the WebSocket connection?

@amy Please write unit tests for the message validation logic
```

### 3. Multiple Agents
You can work with multiple agents in the same conversation:
```
@sheldon design the backend API for sending messages
@bernadette create the SDK wrapper for that API
@amy write tests for both the API and SDK
```

## Agent Collaboration Examples

### Example 1: Complete Feature Implementation
```
User: We need to implement the message sending feature end-to-end

@sheldon: Design and implement the backend message queueing and dispatch logic
@leonard: Create the Android SmsDispatcher that receives and sends SMS
@bernadette: Build the REST API endpoint and Node.js SDK
@amy: Write comprehensive tests for all components
@penny: Create the UI for viewing sent messages
```

### Example 2: Infrastructure Setup
```
User: Set up the complete development and production environment

@howard: Create Docker Compose for local development
@raj: Design and create the PostgreSQL database schema
@howard: Set up CI/CD pipeline with automated testing and deployment
@sheldon: Configure the Redis message queue
```

### Example 3: Full-Stack Feature
```
User: Add webhook notification system

@sheldon: Implement webhook delivery with retry logic
@bernadette: Create webhook signature generation and validation
@raj: Design the webhook_deliveries table
@penny: Build the webhook configuration UI
@amy: Test webhook delivery and signature verification
```

## Best Practices

1. **Be Specific**: The more specific your request, the better the agent can help
2. **One Agent at a Time**: For complex tasks, work with one agent first, then involve others
3. **Review Code**: Always review agent-generated code before committing
4. **Test Everything**: Use @amy to create tests for new features
5. **Document Changes**: Keep this documentation updated as you add features

## Agent Personality Notes

- **Sheldon**: Perfectionist, expects high code quality, very detail-oriented
- **Leonard**: Practical, balances ideal vs. working solutions
- **Penny**: User-focused, advocates for simplicity and clarity
- **Howard**: Hands-on engineer, focuses on automation
- **Raj**: Precise with data, thoughtful about relationships
- **Amy**: Methodical tester, scientific approach to quality
- **Bernadette**: Direct and efficient, no-nonsense about APIs

## Getting Started

1. **Read the Technical Document**: Review `CodeReply_Technical_Document.md`
2. **Choose Your Agent**: Based on what you want to build
3. **Ask for Help**: Start with `@<agent-name>` and describe your task
4. **Iterate**: Work with the agent to refine and improve

## Need Help?

If you're unsure which agent to use:
- Backend/API work → @sheldon or @bernadette
- Android app → @leonard
- Web interface → @penny
- Database → @raj
- Testing → @amy
- Deployment → @howard

Happy coding with the CodeReply team! 🚀
