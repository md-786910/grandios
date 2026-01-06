/**
 * Test Cascade Sync API Flow
 * Simulates the API flow: sync customer → orders → products → discount
 * Run: node server/scripts/testCascadeAPI.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const cascadeSyncService = require('../services/cascadingSyncService');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const OrderLine = require('../models/OrderLine');
const Product = require('../models/Product');
const ProductAttribute = require('../models/ProductAttribute');
const ProductAttributeValue = require('../models/ProductAttributeValue');
const Discount = require('../models/Discount');
const DiscountOrder = require('../models/DiscountOrder');

async function printCounts(label) {
  const counts = {
    customers: await Customer.countDocuments(),
    orders: await Order.countDocuments(),
    orderLines: await OrderLine.countDocuments(),
    products: await Product.countDocuments(),
    attributes: await ProductAttribute.countDocuments(),
    attributeValues: await ProductAttributeValue.countDocuments(),
    discounts: await Discount.countDocuments(),
    discountGroups: await DiscountOrder.countDocuments(),
  };
  console.log(`\n=== ${label} ===`);
  console.table(counts);
  return counts;
}

async function testCascadeAPI() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');

    await printCounts('Initial State (Empty)');

    // Test 1: Get cascade status (simulating GET /api/sync/cascade/status)
    console.log('\n📡 API: GET /api/sync/cascade/status');
    const status = cascadeSyncService.getCascadeStatus();
    console.log('Response:', JSON.stringify(status, null, 2));

    // Test 2: Sync a single customer with 3+ orders
    // Using contactId 179 (Andrea Kindler - has many orders)
    const testContactId = 179;
    console.log(`\n📡 API: POST /api/sync/cascade/customer/${testContactId}`);
    console.log('Starting cascade sync for customer...\n');

    const result = await cascadeSyncService.syncCustomerWithRelatedData(testContactId);

    console.log('✓ Sync completed!');
    console.log('Result:', {
      customerName: result.customer.name,
      ordersCount: result.ordersCount,
      success: result.success,
    });

    await printCounts('After Single Customer Cascade Sync');

    // Show the synced customer details
    const customer = await Customer.findOne({ contactId: testContactId });
    console.log('\n=== Customer Details ===');
    console.log(`Name: ${customer.name}`);
    console.log(`Contact ID: ${customer.contactId}`);
    console.log(`Email: ${customer.email}`);
    console.log(`Wallet: €${customer.wallet?.toFixed(2)}`);
    console.log(`Total Discount Granted: €${customer.totalDiscountGranted?.toFixed(2)}`);

    // Show orders
    const orders = await Order.find({ customerId: customer._id })
      .sort({ orderDate: -1 })
      .limit(5)
      .lean();
    console.log(`\n=== Recent Orders (showing 5 of ${result.ordersCount}) ===`);
    orders.forEach(o => {
      console.log(`  ${o.posReference}: €${o.amountTotal?.toFixed(2)} - ${o.state}`);
    });

    // Show order lines
    const orderLines = await OrderLine.find()
      .populate('productRef', 'name')
      .limit(5)
      .lean();
    console.log(`\n=== Sample Order Lines (5) ===`);
    orderLines.forEach(l => {
      console.log(`  ${l.productName}: ${l.quantity} x €${l.priceUnit?.toFixed(2)}`);
    });

    // Show discount groups
    const discountGroups = await DiscountOrder.find({ customerId: customer._id })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();
    console.log(`\n=== Discount Groups (showing 3) ===`);
    discountGroups.forEach(g => {
      console.log(`  ${g.orders?.length} orders → Total: €${g.totalAmount?.toFixed(2)}, Discount: €${g.totalDiscount?.toFixed(2)} (${g.status})`);
    });

    // Show products synced
    const products = await Product.find().limit(5).lean();
    console.log(`\n=== Sample Products (5) ===`);
    products.forEach(p => {
      console.log(`  ${p.name}: €${p.listPrice?.toFixed(2)}`);
    });

    // Test 3: Get discount groups (simulating GET /api/sync/data/discount-groups)
    console.log('\n📡 API: GET /api/sync/data/discount-groups');
    const totalGroups = await DiscountOrder.countDocuments();
    const availableGroups = await DiscountOrder.countDocuments({ status: 'available' });
    console.log(`Total discount groups: ${totalGroups}`);
    console.log(`Available groups: ${availableGroups}`);

    console.log('\n✅ All API tests completed successfully!');

  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testCascadeAPI();
