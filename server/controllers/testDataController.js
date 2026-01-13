const Customer = require("../models/Customer");
const Order = require("../models/Order");

// Default product image from WAWI
const DEFAULT_PRODUCT_IMAGE =
  "https://11316b7a2b.wawi.onretail.eu/web/image/product.template/472/image_256";

// Sample product data for generating test orders (using picsum.photos for realistic product images)
const sampleProducts = [
  { name: "T-Shirt Basic", price: 19.99, image: "https://picsum.photos/seed/tshirt/200/200" },
  { name: "Hoodie Premium", price: 49.99, image: "https://picsum.photos/seed/hoodie/200/200" },
  { name: "Polo Shirt", price: 29.99, image: "https://picsum.photos/seed/polo/200/200" },
  { name: "Jeans Classic", price: 59.99, image: "https://picsum.photos/seed/jeans/200/200" },
  { name: "Sneakers Sport", price: 89.99, image: "https://picsum.photos/seed/sneakers/200/200" },
  { name: "Cap Embroidered", price: 14.99, image: "https://picsum.photos/seed/cap/200/200" },
  { name: "Jacket Winter", price: 99.99, image: "https://picsum.photos/seed/jacket/200/200" },
  { name: "Shorts Summer", price: 24.99, image: "https://picsum.photos/seed/shorts/200/200" },
  { name: "Socks Pack", price: 9.99, image: "https://picsum.photos/seed/socks/200/200" },
  { name: "Belt Leather", price: 34.99, image: "https://picsum.photos/seed/belt/200/200" },
];

const sampleCustomers = [
  { name: "Max Mustermann", email: "max@example.com", phone: "+49 123 456789" },
  { name: "Anna Schmidt", email: "anna@example.com", phone: "+49 234 567890" },
  { name: "Peter Weber", email: "peter@example.com", phone: "+49 345 678901" },
  {
    name: "Julia Fischer",
    email: "julia@example.com",
    phone: "+49 456 789012",
  },
  {
    name: "Thomas Müller",
    email: "thomas@example.com",
    phone: "+49 567 890123",
  },
];

// Generate random number between min and max
const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Generate random order items
const generateOrderItems = (count = 3) => {
  const items = [];
  const usedProducts = new Set();

  for (let i = 0; i < count; i++) {
    let productIndex;
    do {
      productIndex = randomBetween(0, sampleProducts.length - 1);
    } while (
      usedProducts.has(productIndex) &&
      usedProducts.size < sampleProducts.length
    );

    usedProducts.add(productIndex);
    const product = sampleProducts[productIndex];
    const quantity = randomBetween(1, 5);
    const priceUnit = product.price;
    const priceSubtotal = priceUnit * quantity;
    const priceSubtotalIncl = priceSubtotal * 1.19; // 19% VAT

    items.push({
      orderLineId: Date.now() + i,
      productId: productIndex + 1,
      productName: product.name,
      priceUnit,
      quantity,
      discount: 0,
      priceSubtotal,
      priceSubtotalIncl,
      image: product.image,
      discountEligible: Math.random() > 0.2, // 80% of items are discount eligible
    });
  }

  return items;
};

// @desc    Generate test customer
// @route   POST /api/test/customer
// @access  Private
exports.generateTestCustomer = async (req, res, next) => {
  try {
    const sampleCustomer =
      sampleCustomers[randomBetween(0, sampleCustomers.length - 1)];
    const timestamp = Date.now();

    const customer = await Customer.create({
      ref: `CUST-${timestamp}`,
      name: `${sampleCustomer.name} (Test)`,
      email: `test${timestamp}@example.com`,
      phone: sampleCustomer.phone,
      address: {
        street: "Teststraße " + randomBetween(1, 100),
        postalCode: String(randomBetween(10000, 99999)),
        city: "Berlin",
        country: "Deutschland",
      },
    });

    res.status(201).json({
      success: true,
      data: customer,
      message: "Test customer created",
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Generate test orders for a customer
// @route   POST /api/test/orders/:customerId
// @access  Private
exports.generateTestOrders = async (req, res, next) => {
  try {
    const { count = 3 } = req.body;
    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const orders = [];

    for (let i = 0; i < Math.min(count, 10); i++) {
      // Max 10 orders at once
      const items = generateOrderItems(randomBetween(2, 5));
      const amountTotal = items.reduce(
        (sum, item) => sum + item.priceSubtotalIncl,
        0
      );
      const timestamp = Date.now() + i;

      // Generate order date within last 30 days
      const orderDate = new Date();
      orderDate.setDate(orderDate.getDate() - randomBetween(0, 30));

      const order = await Order.create({
        orderId: timestamp,
        posReference: `ORD-${timestamp}`,
        customerId: customer._id,
        partnerId: customer.contactId,
        orderDate,
        amountTotal: Math.round(amountTotal * 100) / 100,
        amountPaid: Math.round(amountTotal * 100) / 100,
        amountTax: Math.round(amountTotal * 0.19 * 100) / 100,
        state: "completed",
        items,
      });

      orders.push(order);
    }

    res.status(201).json({
      success: true,
      count: orders.length,
      data: orders,
      message: `${orders.length} test orders created for ${customer.name}`,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Generate complete test data (customers + orders)
// @route   POST /api/test/generate
// @access  Private
exports.generateCompleteTestData = async (req, res, next) => {
  try {
    const { customerCount = 3, ordersPerCustomer = 4 } = req.body;
    const results = [];

    for (let c = 0; c < Math.min(customerCount, 10); c++) {
      const sampleCustomer = sampleCustomers[c % sampleCustomers.length];
      const timestamp = Date.now() + c;

      // Create customer
      const customer = await Customer.create({
        ref: `CUST-${timestamp}`,
        name: `${sampleCustomer.name} (Test ${c + 1})`,
        email: `test${timestamp}@example.com`,
        phone: sampleCustomer.phone,
        address: {
          street: "Teststraße " + randomBetween(1, 100),
          postalCode: String(randomBetween(10000, 99999)),
          city: ["Berlin", "München", "Hamburg", "Köln", "Frankfurt"][c % 5],
          country: "Deutschland",
        },
      });

      const orders = [];

      // Create orders for this customer
      for (let o = 0; o < ordersPerCustomer; o++) {
        const items = generateOrderItems(randomBetween(2, 5));
        const amountTotal = items.reduce(
          (sum, item) => sum + item.priceSubtotalIncl,
          0
        );
        const orderTimestamp = timestamp + o + 1000;

        const orderDate = new Date();
        orderDate.setDate(orderDate.getDate() - randomBetween(0, 60));

        const order = await Order.create({
          orderId: orderTimestamp,
          posReference: `ORD-${orderTimestamp}`,
          customerId: customer._id,
          partnerId: customer.contactId,
          orderDate,
          amountTotal: Math.round(amountTotal * 100) / 100,
          amountPaid: Math.round(amountTotal * 100) / 100,
          amountTax: Math.round(amountTotal * 0.19 * 100) / 100,
          state: "completed",
          items,
        });

        orders.push(order);
      }

      results.push({
        customer,
        orderCount: orders.length,
      });
    }

    res.status(201).json({
      success: true,
      message: `Created ${results.length} customers with orders`,
      data: results,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Clear all test data
// @route   DELETE /api/test/clear
// @access  Private
exports.clearTestData = async (req, res, next) => {
  try {
    // Delete test customers and their orders
    const testCustomers = await Customer.find({ name: /\(Test/ });
    const customerIds = testCustomers.map((c) => c._id);

    const deletedOrders = await Order.deleteMany({
      customerId: { $in: customerIds },
    });
    const deletedCustomers = await Customer.deleteMany({ name: /\(Test/ });

    res.status(200).json({
      success: true,
      message: `Deleted ${deletedCustomers.deletedCount} test customers and ${deletedOrders.deletedCount} test orders`,
    });
  } catch (err) {
    next(err);
  }
};
