/**
 * Test script for full product attribute sync to MongoDB
 * Run: node server/scripts/testFullAttributeSync.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const syncService = require('../services/wawiSyncService');
const ProductAttribute = require('../models/ProductAttribute');
const ProductAttributeValue = require('../models/ProductAttributeValue');

async function testFullSync() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');

    // Sync product attributes
    console.log('1. Syncing product attributes...');
    const attrResult = await syncService.syncProductAttributes();
    console.log(`   Result: ${attrResult.created} created, ${attrResult.updated} updated\n`);

    // Sync product attribute values
    console.log('2. Syncing product attribute values...');
    const valResult = await syncService.syncProductAttributeValues();
    console.log(`   Result: ${valResult.created} created, ${valResult.updated} updated\n`);

    // Verify in database
    console.log('3. Verifying in database...');
    const attrCount = await ProductAttribute.countDocuments();
    const valCount = await ProductAttributeValue.countDocuments();
    console.log(`   Attributes in DB: ${attrCount}`);
    console.log(`   Attribute values in DB: ${valCount}\n`);

    // Show sample data
    console.log('4. Sample attribute from DB:');
    const sampleAttr = await ProductAttribute.findOne().lean();
    console.log(JSON.stringify(sampleAttr, null, 2));

    console.log('\n5. Sample attribute value from DB:');
    const sampleVal = await ProductAttributeValue.findOne().populate('attributeId').lean();
    console.log(JSON.stringify(sampleVal, null, 2));

    console.log('\n✓ Full attribute sync test completed successfully!');
  } catch (error) {
    console.error('✗ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testFullSync();
