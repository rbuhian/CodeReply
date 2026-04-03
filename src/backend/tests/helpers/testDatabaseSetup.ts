/**
 * Test Database Setup
 * Provides utilities for setting up and tearing down test database
 */

import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'crypto';

interface TestDatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export class TestDatabase {
  private pool: Pool;
  private client: PoolClient | null = null;

  constructor(config?: Partial<TestDatabaseConfig>) {
    const defaultConfig: TestDatabaseConfig = {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
      database: process.env.TEST_DB_NAME || 'codereply_test',
    };

    this.pool = new Pool({ ...defaultConfig, ...config });
  }

  /**
   * Get a database client for transactions
   */
  async getClient(): Promise<PoolClient> {
    if (!this.client) {
      this.client = await this.pool.connect();
    }
    return this.client;
  }

  /**
   * Execute a raw SQL query
   */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  /**
   * Execute a query and return a single row
   */
  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<void> {
    const client = await this.getClient();
    await client.query('BEGIN');
  }

  /**
   * Commit a transaction
   */
  async commitTransaction(): Promise<void> {
    if (this.client) {
      await this.client.query('COMMIT');
    }
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction(): Promise<void> {
    if (this.client) {
      await this.client.query('ROLLBACK');
    }
  }

  /**
   * Clean all test data from the database
   */
  async cleanDatabase(): Promise<void> {
    await this.query('TRUNCATE TABLE webhook_deliveries CASCADE');
    await this.query('TRUNCATE TABLE messages CASCADE');
    await this.query('TRUNCATE TABLE gateway_devices CASCADE');
    await this.query('TRUNCATE TABLE api_keys CASCADE');
    await this.query('TRUNCATE TABLE subscribers CASCADE');
  }

  /**
   * Seed the database with test data
   */
  async seed(): Promise<void> {
    // This will be populated by individual test factories
    // Kept empty to allow tests to control their own data
  }

  /**
   * Close all database connections
   */
  async close(): Promise<void> {
    if (this.client) {
      this.client.release();
      this.client = null;
    }
    await this.pool.end();
  }

  /**
   * Create a test subscriber
   */
  async createSubscriber(data: {
    name?: string;
    email?: string;
    plan?: string;
    daily_quota?: number;
    max_devices?: number;
  } = {}): Promise<{
    id: string;
    name: string;
    email: string;
    plan: string;
    daily_quota: number;
    max_devices: number;
    device_count: number;
    created_at: Date;
  }> {
    const id = randomUUID();
    const email = data.email || `test-${id.slice(0, 8)}@example.com`;
    const name = data.name || `Test Subscriber ${id.slice(0, 8)}`;

    const result = await this.queryOne<any>(
      `INSERT INTO subscribers (id, name, email, plan, daily_quota, max_devices)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id,
        name,
        email,
        data.plan || 'free',
        data.daily_quota ?? 100,
        data.max_devices ?? 1,
      ]
    );

    return result!;
  }

  /**
   * Create a test API key
   */
  async createApiKey(subscriberId: string, data: {
    key_hash?: string;
    key_prefix?: string;
    label?: string;
    is_active?: boolean;
  } = {}): Promise<{
    id: string;
    subscriber_id: string;
    key_hash: string;
    key_prefix: string;
    label: string | null;
    is_active: boolean;
    created_at: Date;
  }> {
    const id = randomUUID();
    const keyHash = data.key_hash || `hash_${randomUUID()}`;
    const keyPrefix = data.key_prefix || `cr_test_${randomUUID().slice(0, 8)}`;

    const result = await this.queryOne<any>(
      `INSERT INTO api_keys (id, subscriber_id, key_hash, key_prefix, label, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, subscriberId, keyHash, keyPrefix, data.label || null, data.is_active ?? true]
    );

    return result!;
  }

  /**
   * Create a test gateway device
   */
  async createDevice(subscriberId: string, data: {
    name?: string;
    device_label?: string;
    device_token?: string;
    sim_carrier?: string;
    sim_number?: string;
    status?: string;
    is_enabled?: boolean;
  } = {}): Promise<{
    id: string;
    subscriber_id: string;
    name: string;
    device_label: string | null;
    device_token: string;
    sim_carrier: string | null;
    sim_number: string | null;
    status: string;
    is_enabled: boolean;
    last_heartbeat: Date | null;
    registered_at: Date;
  }> {
    const id = randomUUID();
    const deviceToken = data.device_token || `token_${randomUUID()}`;
    const name = data.name || `Test Device ${id.slice(0, 8)}`;

    const result = await this.queryOne<any>(
      `INSERT INTO gateway_devices
       (id, subscriber_id, name, device_label, device_token, sim_carrier, sim_number, status, is_enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $2)
       RETURNING *`,
      [
        id,
        subscriberId,
        name,
        data.device_label || null,
        deviceToken,
        data.sim_carrier || null,
        data.sim_number || null,
        data.status || 'OFFLINE',
        data.is_enabled ?? true,
      ]
    );

    return result!;
  }

  /**
   * Create a test message
   */
  async createMessage(subscriberId: string, data: {
    gateway_id?: string | null;
    to_number?: string;
    body?: string;
    status?: string;
    webhook_url?: string | null;
    metadata?: any;
  } = {}): Promise<{
    id: string;
    subscriber_id: string;
    gateway_id: string | null;
    to_number: string;
    body: string;
    status: string;
    queued_at: Date;
  }> {
    const id = randomUUID();
    const toNumber = data.to_number || '+639171234567';
    const body = data.body || 'Test message';

    const result = await this.queryOne<any>(
      `INSERT INTO messages
       (id, subscriber_id, gateway_id, to_number, body, status, webhook_url, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        subscriberId,
        data.gateway_id || null,
        toNumber,
        body,
        data.status || 'QUEUED',
        data.webhook_url || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]
    );

    return result!;
  }

  /**
   * Get subscriber by ID
   */
  async getSubscriber(id: string) {
    return this.queryOne('SELECT * FROM subscribers WHERE id = $1', [id]);
  }

  /**
   * Get device by ID
   */
  async getDevice(id: string) {
    return this.queryOne('SELECT * FROM gateway_devices WHERE id = $1', [id]);
  }

  /**
   * Get message by ID
   */
  async getMessage(id: string) {
    return this.queryOne('SELECT * FROM messages WHERE id = $1', [id]);
  }

  /**
   * Update device status
   */
  async updateDeviceStatus(id: string, status: string, lastHeartbeat?: Date) {
    const result = await this.queryOne(
      `UPDATE gateway_devices
       SET status = $1, last_heartbeat = $2
       WHERE id = $3
       RETURNING *`,
      [status, lastHeartbeat || new Date(), id]
    );
    return result;
  }

  /**
   * Soft delete a device
   */
  async softDeleteDevice(id: string) {
    const result = await this.queryOne(
      `UPDATE gateway_devices
       SET deleted_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result;
  }
}

// Singleton instance for tests
let testDbInstance: TestDatabase | null = null;

export function getTestDatabase(): TestDatabase {
  if (!testDbInstance) {
    testDbInstance = new TestDatabase();
  }
  return testDbInstance;
}

export async function closeTestDatabase(): Promise<void> {
  if (testDbInstance) {
    await testDbInstance.close();
    testDbInstance = null;
  }
}
