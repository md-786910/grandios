/**
 * Test script for cascading sync
 * Run: node server/scripts/testCascadeSync.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const cascadeSyncService = require('../services/cascadingSyncService');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const OrderLine = require('../models/OrderLine');
const Product = require('../models/Product');
const DiscountOrder = require('../models/DiscountOrder');

async function testCascadeSync() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');

    // Get counts before sync
    console.log('=== Before Sync ===');
    const beforeCounts = {
      customers: await Customer.countDocuments(),
      orders: await Order.countDocuments(),
      orderLines: await OrderLine.countDocuments(),
      products: await Product.countDocuments(),
      discountGroups: await DiscountOrder.countDocuments(),
    };
    console.log('Counts:', beforeCounts);

    // Find a customer with orders to test
    console.log('\n=== Finding a customer with orders ===');
    const customerWithOrders = await Customer.findOne({ contactId: { $exists: true } });

    if (customerWithOrders) {
      console.log(`Testing cascade sync for: ${customerWithOrders.name} (contactId: ${customerWithOrders.contactId})`);

      // Run cascade sync for this customer
      console.log('\n=== Running Cascade Sync ===');
      const result = await cascadeSyncService.syncCustomerWithRelatedData(customerWithOrders.contactId);
      console.log('Sync result:', result);

      // Get counts after sync
      console.log('\n=== After Sync ===');
      const afterCounts = {
        customers: await Customer.countDocuments(),
        orders: await Order.countDocuments(),
        orderLines: await OrderLine.countDocuments(),
        products: await Product.countDocuments(),
        discountGroups: await DiscountOrder.countDocuments(),
      };
      console.log('Counts:', afterCounts);

      // Show customer's orders
      const customerOrders = await Order.find({ customerId: customerWithOrders._id })
        .populate('orderLines')
        .lean();
      console.log(`\nCustomer has ${customerOrders.length} orders`);

      if (customerOrders.length > 0) {
        console.log('\nFirst order details:');
        console.log(`  POS Reference: ${customerOrders[0].posReference}`);
        console.log(`  Amount: €${customerOrders[0].amountTotal}`);
        console.log(`  Order Lines: ${customerOrders[0].orderLines?.length || 0}`);
      }

      // Check discount groups
      const discountGroups = await DiscountOrder.find({ customerId: customerWithOrders._id }).lean();
      console.log(`\nDiscount groups for customer: ${discountGroups.length}`);

      if (discountGroups.length > 0) {
        console.log('First discount group:');
        console.log(`  Orders in group: ${discountGroups[0].orders?.length || 0}`);
        console.log(`  Total Amount: €${discountGroups[0].totalAmount?.toFixed(2)}`);
        console.log(`  Total Discount: €${discountGroups[0].totalDiscount?.toFixed(2)}`);
        console.log(`  Status: ${discountGroups[0].status}`);
      }
    } else {
      console.log('No customer found with contactId. Running full sync test...');
    }

    console.log('\n✓ Cascade sync test completed!');
  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testCascadeSync();
