/**
 * Test Discount API with orderLines
 * Run: node server/scripts/testDiscountAPI.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const OrderLine = require('../models/OrderLine');
const Product = require('../models/Product');

function getOrderItems(order) {
  if (order.orderLines && order.orderLines.length > 0) {
    return order.orderLines.map(line => ({
      orderLineId: line.orderLineId || line._id,
      productId: line.productId,
      productName: line.fullProductName || line.productName,
      priceUnit: line.priceUnit || 0,
      priceSubtotalIncl: line.priceSubtotalIncl || (line.priceUnit * (line.quantity || 1)),
      quantity: line.quantity || 1,
      discount: line.discount || 0,
      discountEligible: line.discountEligible !== false,
      image: line.productRef ? line.productRef.image : null,
    }));
  }
  return order.items || [];
}

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const customer = await Customer.findOne();
  if (!customer) {
    console.log('No customer found');
    await mongoose.disconnect();
    return;
  }

  const orders = await Order.find({ customerId: customer._id })
    .populate({
      path: 'orderLines',
      populate: {
        path: 'productRef',
        select: 'name image listPrice defaultCode',
      },
    })
    .limit(3);

  console.log('\nCustomer:', customer.name);
  console.log('Orders found:', orders.length);

  orders.forEach((order, i) => {
    const items = getOrderItems(order);
    console.log(`\nOrder ${i + 1}: ${order.posReference}`);
    console.log('  Amount Total:', order.amountTotal);
    console.log('  OrderLines count:', order.orderLines?.length || 0);
    console.log('  Items (mapped) count:', items.length);

    if (items.length > 0) {
      console.log('\n  First item:');
      console.log('    productName:', items[0].productName);
      console.log('    priceSubtotalIncl:', items[0].priceSubtotalIncl);
      console.log('    hasImage:', items[0].image ? 'Yes' : 'No');
      console.log('    image URL:', items[0].image || 'N/A');
      console.log('    discountEligible:', items[0].discountEligible);
    }
  });

  await mongoose.disconnect();
  console.log('\nTest completed!');
}

test().catch(console.error);
