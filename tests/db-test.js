/**
 * Thapsus Cargo Database Function Tests
 *
 * Standalone test script — no test framework required.
 * Connects to your Supabase database and tests core operations.
 *
 * Usage:
 *   node tests/db-test.js
 *
 * Requirements:
 *   - DATABASE_URL environment variable must be set
 *   - Or create a .env file in the project root
 *
 * WARNING: This creates and deletes test data. It uses unique
 * identifiers to avoid conflicts, but should ideally be run
 * against a staging/dev database rather than production.
 */

import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

// ── Setup ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  family: 0,
  max: 5,
  connectionTimeoutMillis: 10000,
});

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  ✗ ${message}`);
  }
}

// Unique prefix for test data to avoid collisions
const TEST_PREFIX = `test_${Date.now()}`;

// Test data IDs (cleaned up at the end)
const testIds = {
  userId: uuidv4(),
  adminId: uuidv4(),
  orderId: uuidv4(),
  packageId: uuidv4(),
  walletId: uuidv4(),
  adminWalletId: uuidv4(),
  transactionId: uuidv4(),
  ticketId: uuidv4(),
  messageId: uuidv4(),
  notificationId: uuidv4(),
  tokenId: uuidv4(),
  referralId: uuidv4(),
  logId: uuidv4(),
};

// ── Tests ──────────────────────────────────────────────────────────────────

async function testConnection() {
  console.log('\n📡 Test: Database Connection');
  try {
    const res = await pool.query('SELECT NOW() AS server_time');
    assert(res.rows.length === 1, 'Connection successful');
    assert(!!res.rows[0].server_time, `Server time: ${res.rows[0].server_time}`);
  } catch (err) {
    assert(false, `Connection failed: ${err.message}`);
  }
}

async function testTablesExist() {
  console.log('\n📋 Test: Tables Exist');
  const tables = [
    'users', 'orders', 'packages', 'transactions', 'wallet',
    'referrals', 'tickets', 'ticket_messages', 'notifications',
    'admin_logs', 'exchange_rates', 'password_reset_tokens', 'backups'
  ];

  for (const table of tables) {
    try {
      const res = await pool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      assert(res.rows[0].exists, `Table '${table}' exists`);
    } catch (err) {
      assert(false, `Table '${table}' check failed: ${err.message}`);
    }
  }
}

async function testUserCRUD() {
  console.log('\n👤 Test: User CRUD Operations');

  // Create admin user first (needed as reference for some FK constraints)
  const adminHash = bcrypt.hashSync('admin_test_pass', 10);
  await pool.query(
    `INSERT INTO users (id, email, password, name, phone, role, warehouse_id, referral_code, is_active)
     VALUES ($1, $2, $3, $4, $5, 'admin', $6, $7, true)`,
    [testIds.adminId, `${TEST_PREFIX}_admin@test.com`, adminHash, 'Test Admin', '+254700000000',
     `WH-${TEST_PREFIX}-A`, `REF${TEST_PREFIX}A`]
  );

  // Create test user
  const passwordHash = bcrypt.hashSync('test_password_123', 10);
  try {
    await pool.query(
      `INSERT INTO users (id, email, password, name, phone, role, warehouse_id, referral_code, is_active)
       VALUES ($1, $2, $3, $4, $5, 'customer', $6, $7, true)`,
      [testIds.userId, `${TEST_PREFIX}@test.com`, passwordHash, 'Test User', '+254712345678',
       `WH-${TEST_PREFIX}`, `REF${TEST_PREFIX}`]
    );
    assert(true, 'User created successfully');
  } catch (err) {
    assert(false, `User creation failed: ${err.message}`);
    return;
  }

  // Read user
  const user = await pool.query('SELECT * FROM users WHERE id = $1', [testIds.userId]);
  assert(user.rows.length === 1, 'User can be read back');
  assert(user.rows[0].email === `${TEST_PREFIX}@test.com`, 'User email matches');
  assert(user.rows[0].role === 'customer', 'User role is customer');
  assert(user.rows[0].is_active === true, 'User is active by default');

  // Verify password hash
  const passwordValid = bcrypt.compareSync('test_password_123', user.rows[0].password);
  assert(passwordValid, 'Password hash verification works');

  // Update user
  await pool.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', ['Updated Name', testIds.userId]);
  const updated = await pool.query('SELECT name FROM users WHERE id = $1', [testIds.userId]);
  assert(updated.rows[0].name === 'Updated Name', 'User name updated successfully');

  // Deactivate user
  await pool.query('UPDATE users SET is_active = false WHERE id = $1', [testIds.userId]);
  const deactivated = await pool.query('SELECT is_active FROM users WHERE id = $1', [testIds.userId]);
  assert(deactivated.rows[0].is_active === false, 'User deactivated successfully');

  // Reactivate user
  await pool.query('UPDATE users SET is_active = true WHERE id = $1', [testIds.userId]);
  const reactivated = await pool.query('SELECT is_active FROM users WHERE id = $1', [testIds.userId]);
  assert(reactivated.rows[0].is_active === true, 'User reactivated successfully');

  // Test duplicate email rejection
  try {
    await pool.query(
      `INSERT INTO users (id, email, password, name, phone, role, warehouse_id, referral_code)
       VALUES ($1, $2, $3, $4, $5, 'customer', $6, $7)`,
      [uuidv4(), `${TEST_PREFIX}@test.com`, passwordHash, 'Duplicate', '+254700000001',
       `WH-DUP-${TEST_PREFIX}`, `REFDUP${TEST_PREFIX}`]
    );
    assert(false, 'Duplicate email should have been rejected');
  } catch (err) {
    assert(err.code === '23505', 'Duplicate email correctly rejected (unique constraint)');
  }
}

async function testWalletOperations() {
  console.log('\n💰 Test: Wallet Operations');

  // Create wallet
  await pool.query(
    `INSERT INTO wallet (id, user_id, balance, currency) VALUES ($1, $2, 0, 'KES')`,
    [testIds.walletId, testIds.userId]
  );
  await pool.query(
    `INSERT INTO wallet (id, user_id, balance, currency) VALUES ($1, $2, 0, 'KES')`,
    [testIds.adminWalletId, testIds.adminId]
  );
  assert(true, 'Wallet created with zero balance');

  // Add balance
  await pool.query('UPDATE wallet SET balance = balance + 5000, last_updated = NOW() WHERE user_id = $1', [testIds.userId]);
  const wallet = await pool.query('SELECT balance FROM wallet WHERE user_id = $1', [testIds.userId]);
  assert(wallet.rows[0].balance === 5000, 'Wallet balance updated to 5000');

  // Deduct balance
  await pool.query('UPDATE wallet SET balance = balance - 2000, last_updated = NOW() WHERE user_id = $1', [testIds.userId]);
  const deducted = await pool.query('SELECT balance FROM wallet WHERE user_id = $1', [testIds.userId]);
  assert(deducted.rows[0].balance === 3000, 'Wallet balance deducted to 3000');

  // Test duplicate wallet rejection (one wallet per user)
  try {
    await pool.query(
      `INSERT INTO wallet (id, user_id, balance, currency) VALUES ($1, $2, 0, 'KES')`,
      [uuidv4(), testIds.userId]
    );
    assert(false, 'Duplicate wallet should have been rejected');
  } catch (err) {
    assert(err.code === '23505', 'Duplicate wallet correctly rejected (unique user_id)');
  }
}

async function testOrderOperations() {
  console.log('\n📦 Test: Order Operations');

  const trackingNumber = `TC-${TEST_PREFIX}-TEST`;
  await pool.query(
    `INSERT INTO orders (id, user_id, tracking_number, retailer, market, status, description, weight_kg, shipping_speed, insurance, estimated_cost)
     VALUES ($1, $2, $3, 'Amazon UK', 'UK', 'pending', 'Test package', 2.5, 'economy', false, 1500)`,
    [testIds.orderId, testIds.userId, trackingNumber]
  );
  assert(true, 'Order created successfully');

  // Read order
  const order = await pool.query('SELECT * FROM orders WHERE id = $1', [testIds.orderId]);
  assert(order.rows.length === 1, 'Order can be read');
  assert(order.rows[0].tracking_number === trackingNumber, 'Tracking number matches');
  assert(order.rows[0].status === 'pending', 'Initial status is pending');
  assert(order.rows[0].market === 'UK', 'Market is UK');

  // Update order status
  const statuses = ['received_at_warehouse', 'in_transit', 'customs', 'out_for_delivery', 'delivered'];
  for (const status of statuses) {
    await pool.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, testIds.orderId]);
    const updated = await pool.query('SELECT status FROM orders WHERE id = $1', [testIds.orderId]);
    assert(updated.rows[0].status === status, `Order status updated to '${status}'`);
  }

  // Test invalid status rejection
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['invalid_status', testIds.orderId]);
    assert(false, 'Invalid status should have been rejected');
  } catch (err) {
    assert(true, 'Invalid order status correctly rejected (check constraint)');
  }

  // Reset status for further tests
  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['pending', testIds.orderId]);
}

async function testPackageOperations() {
  console.log('\n📋 Test: Package Operations');

  await pool.query(
    `INSERT INTO packages (id, order_id, user_id, description, weight_kg, status)
     VALUES ($1, $2, $3, 'Test package item', 2.5, 'pending')`,
    [testIds.packageId, testIds.orderId, testIds.userId]
  );
  assert(true, 'Package created successfully');

  const pkg = await pool.query('SELECT * FROM packages WHERE id = $1', [testIds.packageId]);
  assert(pkg.rows[0].is_consolidated === false, 'Package not consolidated by default');

  // Mark as received
  await pool.query(
    'UPDATE packages SET status = $1, received_at = NOW(), warehouse_location = $2 WHERE id = $3',
    ['received', 'Bay A-12', testIds.packageId]
  );
  const received = await pool.query('SELECT status, warehouse_location FROM packages WHERE id = $1', [testIds.packageId]);
  assert(received.rows[0].status === 'received', 'Package marked as received');
  assert(received.rows[0].warehouse_location === 'Bay A-12', 'Warehouse location set');
}

async function testTransactions() {
  console.log('\n💳 Test: Transaction Operations');

  // Create deposit transaction
  await pool.query(
    `INSERT INTO transactions (id, user_id, type, amount, currency, payment_method, payment_reference, status)
     VALUES ($1, $2, 'deposit', 5000, 'KES', 'mpesa', $3, 'pending')`,
    [testIds.transactionId, testIds.userId, `MPESA-${TEST_PREFIX}`]
  );
  assert(true, 'Deposit transaction created');

  // Read transaction
  const tx = await pool.query('SELECT * FROM transactions WHERE id = $1', [testIds.transactionId]);
  assert(tx.rows[0].type === 'deposit', 'Transaction type is deposit');
  assert(tx.rows[0].amount === 5000, 'Transaction amount is 5000');
  assert(tx.rows[0].payment_method === 'mpesa', 'Payment method is mpesa');
  assert(tx.rows[0].status === 'pending', 'Transaction status is pending');

  // Complete transaction
  await pool.query('UPDATE transactions SET status = $1 WHERE id = $2', ['completed', testIds.transactionId]);
  const completed = await pool.query('SELECT status FROM transactions WHERE id = $1', [testIds.transactionId]);
  assert(completed.rows[0].status === 'completed', 'Transaction marked as completed');

  // Test invalid payment method
  try {
    await pool.query(
      `INSERT INTO transactions (id, user_id, type, amount, payment_method, status)
       VALUES ($1, $2, 'deposit', 1000, 'bitcoin', 'pending')`,
      [uuidv4(), testIds.userId]
    );
    assert(false, 'Invalid payment method should have been rejected');
  } catch (err) {
    assert(true, 'Invalid payment method correctly rejected');
  }
}

async function testPasswordResetTokens() {
  console.log('\n🔑 Test: Password Reset Tokens');

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

  await pool.query(
    `INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [testIds.tokenId, testIds.userId, token, expiresAt]
  );
  assert(true, 'Password reset token created');

  // Look up token
  const found = await pool.query(
    `SELECT * FROM password_reset_tokens WHERE token = $1 AND used = false AND expires_at > NOW()`,
    [token]
  );
  assert(found.rows.length === 1, 'Valid token found by lookup');
  assert(found.rows[0].user_id === testIds.userId, 'Token belongs to correct user');

  // Mark as used
  await pool.query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [testIds.tokenId]);
  const used = await pool.query(
    `SELECT * FROM password_reset_tokens WHERE token = $1 AND used = false AND expires_at > NOW()`,
    [token]
  );
  assert(used.rows.length === 0, 'Used token no longer found in valid token lookup');
}

async function testTicketSystem() {
  console.log('\n🎫 Test: Support Ticket System');

  await pool.query(
    `INSERT INTO tickets (id, user_id, subject, description, status, priority)
     VALUES ($1, $2, 'Test Issue', 'This is a test ticket', 'open', 'medium')`,
    [testIds.ticketId, testIds.userId]
  );
  assert(true, 'Support ticket created');

  // Add message
  await pool.query(
    `INSERT INTO ticket_messages (id, ticket_id, sender_id, message)
     VALUES ($1, $2, $3, 'Test reply message')`,
    [testIds.messageId, testIds.ticketId, testIds.adminId]
  );
  assert(true, 'Ticket message added');

  // Update ticket status
  await pool.query('UPDATE tickets SET status = $1 WHERE id = $2', ['resolved', testIds.ticketId]);
  const ticket = await pool.query('SELECT status FROM tickets WHERE id = $1', [testIds.ticketId]);
  assert(ticket.rows[0].status === 'resolved', 'Ticket status updated to resolved');
}

async function testNotifications() {
  console.log('\n🔔 Test: Notifications');

  await pool.query(
    `INSERT INTO notifications (id, user_id, type, message)
     VALUES ($1, $2, 'in_app', 'Test notification')`,
    [testIds.notificationId, testIds.userId]
  );
  assert(true, 'Notification created');

  const notif = await pool.query('SELECT * FROM notifications WHERE id = $1', [testIds.notificationId]);
  assert(notif.rows[0].is_read === false, 'Notification unread by default');

  // Mark as read
  await pool.query('UPDATE notifications SET is_read = true WHERE id = $1', [testIds.notificationId]);
  const read = await pool.query('SELECT is_read FROM notifications WHERE id = $1', [testIds.notificationId]);
  assert(read.rows[0].is_read === true, 'Notification marked as read');
}

async function testAdminLogs() {
  console.log('\n📝 Test: Admin Logs');

  await pool.query(
    `INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)`,
    [testIds.logId, testIds.adminId, 'test_action', JSON.stringify({ test: true })]
  );
  assert(true, 'Admin log entry created');

  const log = await pool.query('SELECT * FROM admin_logs WHERE id = $1', [testIds.logId]);
  assert(log.rows[0].action === 'test_action', 'Admin log action matches');
  assert(JSON.parse(log.rows[0].details).test === true, 'Admin log details are valid JSON');
}

async function testCascadeDelete() {
  console.log('\n🗑️  Test: Cascade Delete (User Deletion)');

  // Verify data exists before deletion
  const preOrders = await pool.query('SELECT COUNT(*) AS c FROM orders WHERE user_id = $1', [testIds.userId]);
  assert(parseInt(preOrders.rows[0].c) > 0, 'User has orders before deletion');

  const preWallet = await pool.query('SELECT COUNT(*) AS c FROM wallet WHERE user_id = $1', [testIds.userId]);
  assert(parseInt(preWallet.rows[0].c) > 0, 'User has wallet before deletion');

  // Delete user — should cascade
  await pool.query('DELETE FROM users WHERE id = $1', [testIds.userId]);
  assert(true, 'User deleted');

  // Verify cascades
  const postOrders = await pool.query('SELECT COUNT(*) AS c FROM orders WHERE user_id = $1', [testIds.userId]);
  assert(parseInt(postOrders.rows[0].c) === 0, 'Orders cascade-deleted');

  const postPackages = await pool.query('SELECT COUNT(*) AS c FROM packages WHERE user_id = $1', [testIds.userId]);
  assert(parseInt(postPackages.rows[0].c) === 0, 'Packages cascade-deleted');

  const postWallet = await pool.query('SELECT COUNT(*) AS c FROM wallet WHERE user_id = $1', [testIds.userId]);
  assert(parseInt(postWallet.rows[0].c) === 0, 'Wallet cascade-deleted');

  const postTransactions = await pool.query('SELECT COUNT(*) AS c FROM transactions WHERE user_id = $1', [testIds.userId]);
  assert(parseInt(postTransactions.rows[0].c) === 0, 'Transactions cascade-deleted');

  const postTickets = await pool.query('SELECT COUNT(*) AS c FROM tickets WHERE user_id = $1', [testIds.userId]);
  assert(parseInt(postTickets.rows[0].c) === 0, 'Tickets cascade-deleted');

  const postNotifications = await pool.query('SELECT COUNT(*) AS c FROM notifications WHERE user_id = $1', [testIds.userId]);
  assert(parseInt(postNotifications.rows[0].c) === 0, 'Notifications cascade-deleted');

  const postTokens = await pool.query('SELECT COUNT(*) AS c FROM password_reset_tokens WHERE user_id = $1', [testIds.userId]);
  assert(parseInt(postTokens.rows[0].c) === 0, 'Password reset tokens cascade-deleted');
}

// ── Cleanup & Runner ───────────────────────────────────────────────────────

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  try {
    // Clean up admin user (test user already deleted by cascade test)
    await pool.query('DELETE FROM admin_logs WHERE admin_id = $1', [testIds.adminId]);
    await pool.query('DELETE FROM wallet WHERE user_id = $1', [testIds.adminId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testIds.adminId]);
    console.log('  ✓ Test data cleaned up');
  } catch (err) {
    console.log(`  ⚠ Cleanup warning: ${err.message}`);
  }
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Thapsus Cargo Database Function Tests');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    await testConnection();
    await testTablesExist();
    await testUserCRUD();
    await testWalletOperations();
    await testOrderOperations();
    await testPackageOperations();
    await testTransactions();
    await testPasswordResetTokens();
    await testTicketSystem();
    await testNotifications();
    await testAdminLogs();
    await testCascadeDelete();
  } catch (err) {
    console.error(`\n💥 Unexpected error: ${err.message}`);
    console.error(err.stack);
  }

  await cleanup();
  await pool.end();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  Failures:');
    failures.forEach((f) => console.log(`    ✗ ${f}`));
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run();
