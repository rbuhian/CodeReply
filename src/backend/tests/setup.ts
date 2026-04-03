/**
 * Global test setup file
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Extend Jest timeout for integration tests
jest.setTimeout(30000);

// Global test teardown
afterAll(async () => {
  // Close any open connections
  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 500);
  });
});
