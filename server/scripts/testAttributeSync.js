/**
 * Test script for product attribute sync
 * Run: node server/scripts/testAttributeSync.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const wawiApiClient = require('../services/wawiApiClient');

async function testAttributeSync() {
  try {
    console.log('Testing WAWI Product Attribute API...\n');

    // Test product.attribute model
    console.log('1. Fetching product attributes...');
    const attributesResult = await wawiApiClient.getProductAttributes({
      limit: 5,
    });
    console.log(`   Found ${attributesResult.data.length} attributes`);
    if (attributesResult.data.length > 0) {
      console.log('   Sample attribute:', JSON.stringify(attributesResult.data[0], null, 2));
    }

    // Test product.attribute.value model
    console.log('\n2. Fetching product attribute values...');
    const valuesResult = await wawiApiClient.getProductAttributeValues({
      limit: 10,
    });
    console.log(`   Found ${valuesResult.data.length} attribute values`);
    if (valuesResult.data.length > 0) {
      console.log('   Sample value:', JSON.stringify(valuesResult.data[0], null, 2));
    }

    // Test product.product with attribute fields
    console.log('\n3. Fetching products with attributes...');
    const productsResult = await wawiApiClient.searchRead('product.product', {
      fields: ['id', 'name', 'product_tmpl_id', 'product_template_attribute_value_ids', 'combination_indices'],
      limit: 5,
      domain: [['available_in_pos', '=', true]],
    });
    console.log(`   Found ${productsResult.data.length} products`);
    if (productsResult.data.length > 0) {
      console.log('   Sample product:', JSON.stringify(productsResult.data[0], null, 2));
    }

    // Count total records
    console.log('\n4. Counting total records...');
    const allAttributes = await wawiApiClient.searchRead('product.attribute', {
      fields: ['id'],
      limit: 1000,
    });
    console.log(`   Total attributes: ${allAttributes.data.length}`);

    const allValues = await wawiApiClient.searchRead('product.attribute.value', {
      fields: ['id'],
      limit: 1000,
    });
    console.log(`   Total attribute values: ${allValues.data.length}`);

    console.log('\n✓ Attribute API test completed successfully!');
  } catch (error) {
    console.error('✗ Error:', error.message);
  }
}

testAttributeSync();
