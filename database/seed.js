import { initializeDatabase } from './init.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

/**
 * Seed database with initial data
 */
function seedDatabase() {
  const db = initializeDatabase();

  try {
    // Clear existing data
    db.exec('DELETE FROM admin_logs');
    db.exec('DELETE FROM ticket_messages');
    db.exec('DELETE FROM tickets');
    db.exec('DELETE FROM notifications');
    db.exec('DELETE FROM referrals');
    db.exec('DELETE FROM wallet');
    db.exec('DELETE FROM transactions');
    db.exec('DELETE FROM packages');
    db.exec('DELETE FROM orders');
    db.exec('DELETE FROM users');

    console.log('Cleared existing data');

    // Create admin user
    const adminId = uuidv4();
    const adminRefCode = `REF${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
    const adminHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);

    const insertAdmin = db.prepare(`
      INSERT INTO users (
        id, email, password, name, phone, role, warehouse_id,
        language_pref, referral_code, wallet_balance, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAdmin.run(
      adminId,
      process.env.ADMIN_EMAIL || 'admin@swiftcargo.co.ke',
      adminHash,
      'SwiftCargo Admin',
      '+254700000000',
      'admin',
      `SC-ADM-${Date.now()}`,
      'en',
      adminRefCode,
      0,
      1
    );

    // Create wallet for admin
    const adminWalletId = uuidv4();
    const insertWallet = db.prepare(`
      INSERT INTO wallet (id, user_id, balance, currency)
      VALUES (?, ?, ?, ?)
    `);
    insertWallet.run(adminWalletId, adminId, 0, 'KES');

    console.log('✓ Created admin user: admin@swiftcargo.co.ke');

    // Create sample customers
    const customers = [
      {
        email: 'john.doe@example.com',
        name: 'John Doe',
        phone: '+254712345678'
      },
      {
        email: 'jane.smith@example.com',
        name: 'Jane Smith',
        phone: '+254723456789'
      },
      {
        email: 'david.mwangi@example.com',
        name: 'David Mwangi',
        phone: '+254734567890'
      },
      {
        email: 'sarah.omondi@example.com',
        name: 'Sarah Omondi',
        phone: '+254745678901'
      },
      {
        email: 'michael.kipchoge@example.com',
        name: 'Michael Kipchoge',
        phone: '+254756789012'
      }
    ];

    const insertCustomer = db.prepare(`
      INSERT INTO users (
        id, email, password, name, phone, role, warehouse_id,
        language_pref, referral_code, wallet_balance, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const customerIds = [];

    customers.forEach((customer, index) => {
      const customerId = uuidv4();
      customerIds.push(customerId);
      const passwordHash = bcrypt.hashSync('password123', 10);
      const warehouseId = `SC-${String(index + 1001).slice(-4)}`;
      const refCode = `REF${Date.now()}${Math.random().toString(36).substr(2, 9)}${index}`.toUpperCase();

      insertCustomer.run(
        customerId,
        customer.email,
        passwordHash,
        customer.name,
        customer.phone,
        'customer',
        warehouseId,
        index % 2 === 0 ? 'en' : 'sw',
        refCode,
        Math.random() * 5000,
        1
      );

      // Create wallet for customer
      const walletId = uuidv4();
      insertWallet.run(walletId, customerId, Math.random() * 5000, 'KES');
    });

    console.log(`✓ Created ${customerIds.length} sample customers`);

    // Create sample orders
    const retailers = ['Shein', 'Amazon', 'Next', 'Asos', 'Superdrug', 'Zara', 'H&M', 'Uniqlo'];
    const markets = ['UK', 'USA', 'China'];
    const descriptions = [
      'Clothing and accessories',
      'Electronics and gadgets',
      'Shoes and footwear',
      'Beauty and skincare',
      'Home and garden items',
      'Sports equipment',
      'Books and media',
      'Jewelry and watches'
    ];

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, user_id, tracking_number, retailer, market, status,
        description, weight_kg, dimensions_json, shipping_speed,
        insurance, declared_value, estimated_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPackage = db.prepare(`
      INSERT INTO packages (
        id, order_id, user_id, description, weight_kg,
        status, warehouse_location
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const statuses = ['pending', 'received_at_warehouse', 'consolidating', 'in_transit', 'customs', 'out_for_delivery', 'delivered'];
    const packageStatuses = ['pending', 'received', 'consolidating', 'in_transit', 'customs', 'out_for_delivery', 'delivered'];

    customerIds.slice(0, 3).forEach((userId, userIndex) => {
      for (let i = 0; i < 3; i++) {
        const orderId = uuidv4();
        const trackingNumber = `SC-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        const retailer = retailers[Math.floor(Math.random() * retailers.length)];
        const market = markets[Math.floor(Math.random() * markets.length)];
        const description = descriptions[Math.floor(Math.random() * descriptions.length)];
        const weight = parseFloat((Math.random() * 10 + 0.5).toFixed(2));
        const dimensions = { length: 20 + Math.floor(Math.random() * 30), width: 15 + Math.floor(Math.random() * 25), height: 10 + Math.floor(Math.random() * 20) };
        const speed = Math.random() > 0.5 ? 'economy' : 'express';
        const insurance = Math.random() > 0.7;
        const declaredValue = 50 + Math.floor(Math.random() * 500);
        const estimatedCost = 200 + Math.floor(Math.random() * 800);
        const status = statuses[Math.floor(Math.random() * statuses.length)];

        insertOrder.run(
          orderId,
          userId,
          trackingNumber,
          retailer,
          market,
          status,
          description,
          weight,
          JSON.stringify(dimensions),
          speed,
          insurance ? 1 : 0,
          declaredValue,
          estimatedCost
        );

        // Create package for order
        const packageId = uuidv4();
        const packageStatus = packageStatuses[Math.floor(Math.random() * packageStatuses.length)];
        insertPackage.run(
          packageId,
          orderId,
          userId,
          description,
          weight,
          packageStatus,
          `Section-${String.fromCharCode(65 + Math.floor(Math.random() * 5))}-${Math.floor(Math.random() * 100)}`
        );
      }
    });

    console.log('✓ Created sample orders and packages');

    // Create sample transactions
    const insertTransaction = db.prepare(`
      INSERT INTO transactions (
        id, user_id, type, amount, currency, payment_method,
        payment_reference, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    customerIds.forEach((userId) => {
      for (let i = 0; i < 2; i++) {
        const transactionId = uuidv4();
        const type = Math.random() > 0.5 ? 'deposit' : 'payment';
        const amount = 500 + Math.floor(Math.random() * 5000);
        const method = ['mpesa', 'stripe', 'paypal'][Math.floor(Math.random() * 3)];
        const reference = `${method.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const status = Math.random() > 0.1 ? 'completed' : 'failed';

        insertTransaction.run(
          transactionId,
          userId,
          type,
          amount,
          'KES',
          method,
          reference,
          status
        );
      }
    });

    console.log('✓ Created sample transactions');

    // Create sample referrals
    const insertReferral = db.prepare(`
      INSERT INTO referrals (
        id, referrer_id, referee_id, referral_code, status, reward_amount
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const referralId = uuidv4();
    insertReferral.run(
      referralId,
      customerIds[0],
      customerIds[1],
      `REF-${customerIds[0].slice(0, 8)}`,
      'completed',
      50
    );

    console.log('✓ Created sample referrals');

    // Create sample tickets
    const insertTicket = db.prepare(`
      INSERT INTO tickets (
        id, user_id, subject, description, status, priority
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const ticketIssues = [
      { subject: 'Package delayed', description: 'My package has not arrived as expected' },
      { subject: 'Damaged item', description: 'Item arrived in damaged condition' },
      { subject: 'Missing item', description: 'Item was not in the package' },
      { subject: 'Billing inquiry', description: 'Question about charges on my account' }
    ];

    customerIds.slice(0, 2).forEach((userId) => {
      const ticketId = uuidv4();
      const issue = ticketIssues[Math.floor(Math.random() * ticketIssues.length)];
      const statuses = ['open', 'in_progress', 'resolved'];
      const priorities = ['low', 'medium', 'high'];

      insertTicket.run(
        ticketId,
        userId,
        issue.subject,
        issue.description,
        statuses[Math.floor(Math.random() * statuses.length)],
        priorities[Math.floor(Math.random() * priorities.length)]
      );
    });

    console.log('✓ Created sample tickets');

    // Create sample notifications
    const insertNotification = db.prepare(`
      INSERT INTO notifications (
        id, user_id, type, message, is_read
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const notificationMessages = [
      'Your package has arrived at the warehouse',
      'Your shipment is in transit',
      'Customs clearance completed',
      'Your order is out for delivery',
      'Deposit confirmed to your wallet',
      'New order created successfully'
    ];

    customerIds.slice(0, 3).forEach((userId) => {
      for (let i = 0; i < 2; i++) {
        const notificationId = uuidv4();
        const message = notificationMessages[Math.floor(Math.random() * notificationMessages.length)];
        const type = ['sms', 'email', 'in_app'][Math.floor(Math.random() * 3)];
        const isRead = Math.random() > 0.5 ? 1 : 0;

        insertNotification.run(
          notificationId,
          userId,
          type,
          message,
          isRead
        );
      }
    });

    console.log('✓ Created sample notifications');

    console.log('\nDatabase seeding completed successfully!');
    console.log('\n--- Test Credentials ---');
    console.log(`Admin Email: ${process.env.ADMIN_EMAIL || 'admin@swiftcargo.co.ke'}`);
    console.log(`Admin Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
    console.log('\nSample Customer Credentials:');
    customers.forEach((customer) => {
      console.log(`Email: ${customer.email}, Password: password123`);
    });

    db.close();
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

seedDatabase();
