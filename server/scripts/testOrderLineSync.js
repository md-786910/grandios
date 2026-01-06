/**
 * Test script for order line sync
 * Run: node server/scripts/testOrderLineSync.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const syncService = require('../services/wawiSyncService');
const Order = require('../models/Order');
const OrderLine = require('../models/OrderLine');

async function testOrderLineSync() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');

    // Get current counts
    const orderCountBefore = await Order.countDocuments();
    const orderLineCountBefore = await OrderLine.countDocuments();
    console.log(`Before sync: ${orderCountBefore} orders, ${orderLineCountBefore} order lines\n`);

    // Sync orders (which will also sync order lines)
    console.log('Syncing orders...');
    const result = await syncService.syncOrders({ batchSize: 10 });
    console.log(`Sync result: ${result.created} created, ${result.updated} updated\n`);

    // Get counts after sync
    const orderCountAfter = await Order.countDocuments();
    const orderLineCountAfter = await OrderLine.countDocuments();
    console.log(`After sync: ${orderCountAfter} orders, ${orderLineCountAfter} order lines\n`);

    // Show sample order with order lines
    console.log('Sample order with order lines:');
    const sampleOrder = await Order.findOne()
      .populate('orderLines')
      .lean();

    if (sampleOrder) {
      console.log(`Order ID: ${sampleOrder.orderId}`);
      console.log(`POS Reference: ${sampleOrder.posReference}`);
      console.log(`Amount Total: ${sampleOrder.amountTotal}`);
      console.log(`Embedded items: ${sampleOrder.items?.length || 0}`);
      console.log(`Referenced orderLines: ${sampleOrder.orderLines?.length || 0}`);

      if (sampleOrder.orderLines?.length > 0) {
        console.log('\nFirst order line:');
        console.log(JSON.stringify(sampleOrder.orderLines[0], null, 2));
      }
    }

    // Show sample from OrderLine collection
    console.log('\n\nSample from OrderLine collection:');
    const sampleOrderLine = await OrderLine.findOne()
      .populate('orderId', 'posReference orderDate')
      .populate('productRef', 'name')
      .lean();

    if (sampleOrderLine) {
      console.log(JSON.stringify(sampleOrderLine, null, 2));
    }

    console.log('\n✓ Order line sync test completed!');
  } catch (error) {
    console.error('✗ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testOrderLineSync();
