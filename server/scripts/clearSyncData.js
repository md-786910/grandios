/**
 * Clear sync data for fresh testing
 * Run: node server/scripts/clearSyncData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const OrderLine = require('../models/OrderLine');
const Product = require('../models/Product');
const ProductAttribute = require('../models/ProductAttribute');
const ProductAttributeValue = require('../models/ProductAttributeValue');
const Discount = require('../models/Discount');
const DiscountOrder = require('../models/DiscountOrder');
const OrderCustomerQueue = require('../models/OrderCustomerQueue');

async function clearSyncData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');

    console.log('=== Current Counts ===');
    console.log('Customers:', await Customer.countDocuments());
    console.log('Orders:', await Order.countDocuments());
    console.log('Order Lines:', await OrderLine.countDocuments());
    console.log('Products:', await Product.countDocuments());
    console.log('Product Attributes:', await ProductAttribute.countDocuments());
    console.log('Product Attribute Values:', await ProductAttributeValue.countDocuments());
    console.log('Discounts:', await Discount.countDocuments());
    console.log('Discount Orders:', await DiscountOrder.countDocuments());
    console.log('Order Customer Queue:', await OrderCustomerQueue.countDocuments());

    console.log('\n=== Clearing Data ===');

    // Clear in order (respecting references)
    const discountOrderResult = await DiscountOrder.deleteMany({});
    console.log(`Deleted ${discountOrderResult.deletedCount} discount orders`);

    const discountResult = await Discount.deleteMany({});
    console.log(`Deleted ${discountResult.deletedCount} discounts`);

    const queueResult = await OrderCustomerQueue.deleteMany({});
    console.log(`Deleted ${queueResult.deletedCount} order customer queues`);

    const orderLineResult = await OrderLine.deleteMany({});
    console.log(`Deleted ${orderLineResult.deletedCount} order lines`);

    const orderResult = await Order.deleteMany({});
    console.log(`Deleted ${orderResult.deletedCount} orders`);

    const productResult = await Product.deleteMany({});
    console.log(`Deleted ${productResult.deletedCount} products`);

    const attrValueResult = await ProductAttributeValue.deleteMany({});
    console.log(`Deleted ${attrValueResult.deletedCount} attribute values`);

    const attrResult = await ProductAttribute.deleteMany({});
    console.log(`Deleted ${attrResult.deletedCount} attributes`);

    const customerResult = await Customer.deleteMany({});
    console.log(`Deleted ${customerResult.deletedCount} customers`);

    console.log('\n=== After Clear ===');
    console.log('Customers:', await Customer.countDocuments());
    console.log('Orders:', await Order.countDocuments());
    console.log('Order Lines:', await OrderLine.countDocuments());
    console.log('Products:', await Product.countDocuments());
    console.log('Discounts:', await Discount.countDocuments());
    console.log('Discount Orders:', await DiscountOrder.countDocuments());
    console.log('Order Customer Queue:', await OrderCustomerQueue.countDocuments());

    console.log('\n✓ Data cleared successfully!');
  } catch (error) {
    console.error('✗ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

clearSyncData();
