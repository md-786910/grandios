const mongoose = require("mongoose");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");

// Load env vars
dotenv.config({});

// Load models
const User = require("./models/User");
const Customer = require("./models/Customer");
const Order = require("./models/Order");
const Discount = require("./models/Discount");
const DiscountOrder = require("./models/DiscountOrder");

// Connect to DB
mongoose.connect(process.env.MONGODB_URI);

// Mock data
const adminUser = {
  email: "admin@grandios.com",
  password: "password123",
  name: "Admin User",
  role: "admin",
  notifications: {
    emailOnNewOrders: true,
    dailySummary: false,
  },
};

const customers = [
  {
    contactId: 1001,
    ref: "KUNDE-001",
    name: "Jane Doe",
    email: "jane_doe@gmail.com",
    phone: "+44 (0) 12345678",
    address: {
      street: "Robijnstraat 38",
      postalCode: "1234 RB",
      city: "Alkmaar",
      country: "Netherlands",
    },
  },
  {
    contactId: 1002,
    ref: "KUNDE-002",
    name: "John Smith",
    email: "john_smith@gmail.com",
    phone: "+44 (0) 98765432",
    address: {
      street: "Hauptstrasse 12",
      postalCode: "5678 AB",
      city: "Amsterdam",
      country: "Netherlands",
    },
  },
  {
    contactId: 1003,
    ref: "KUNDE-003",
    name: "Maria Schmidt",
    email: "maria_schmidt@gmail.com",
    phone: "+49 (0) 55544433",
    address: {
      street: "Bergweg 5",
      postalCode: "9012 CD",
      city: "Berlin",
      country: "Germany",
    },
  },
  {
    contactId: 1004,
    ref: "KUNDE-004",
    name: "Peter Müller",
    email: "peter_mueller@gmail.com",
    phone: "+49 (0) 11122233",
    address: {
      street: "Talweg 8",
      postalCode: "3456 EF",
      city: "München",
      country: "Germany",
    },
  },
  {
    contactId: 1005,
    ref: "KUNDE-005",
    name: "Anna Weber",
    email: "anna_weber@gmail.com",
    phone: "+49 (0) 44455566",
    address: {
      street: "Seestrasse 15",
      postalCode: "7890 GH",
      city: "Hamburg",
      country: "Germany",
    },
  },
  {
    contactId: 1006,
    ref: "KUNDE-006",
    name: "Thomas Fischer",
    email: "thomas_fischer@gmail.com",
    phone: "+49 (0) 77788899",
    address: {
      street: "Waldweg 22",
      postalCode: "1234 IJ",
      city: "Frankfurt",
      country: "Germany",
    },
  },
];

// Fixed product data for consistent testing
const products = [
  {
    productId: 101,
    productName: "Premium T-Shirt",
    priceUnit: 50.0,
    image: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=60&h=60&fit=crop",
    color: "Black",
    material: "Cotton",
  },
  {
    productId: 102,
    productName: "Leather Bag",
    priceUnit: 120.0,
    image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=60&h=60&fit=crop",
    color: "Brown",
    material: "Leather",
  },
  {
    productId: 103,
    productName: "Denim Jeans",
    priceUnit: 80.0,
    image: "https://images.unsplash.com/photo-1542272604-787c3835535d?w=60&h=60&fit=crop",
    color: "Blue",
    material: "Denim",
  },
  {
    productId: 104,
    productName: "Wool Sweater",
    priceUnit: 95.0,
    image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=60&h=60&fit=crop",
    color: "Gray",
    material: "Wool",
  },
  {
    productId: 105,
    productName: "Cotton Dress",
    priceUnit: 75.0,
    image: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=60&h=60&fit=crop",
    color: "White",
    material: "Cotton",
  },
  {
    productId: 106,
    productName: "Summer Hat",
    priceUnit: 35.0,
    image: "https://images.unsplash.com/photo-1521369909029-2afed882baee?w=60&h=60&fit=crop",
    color: "Beige",
    material: "Straw",
  },
  {
    productId: 107,
    productName: "Sneakers",
    priceUnit: 110.0,
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=60&h=60&fit=crop",
    color: "Red",
    material: "Canvas",
  },
  {
    productId: 108,
    productName: "Silk Scarf",
    priceUnit: 45.0,
    image: "https://images.unsplash.com/photo-1601924638867-3a6de6b7a500?w=60&h=60&fit=crop",
    color: "Multi",
    material: "Silk",
  },
];

// Fixed orders for testing discount actions
// Structure: Each customer gets specific orders designed for discount testing
const customerOrders = {
  // Jane Doe (Customer 1) - Has 3 orders, all with discount eligible items
  // Total discount eligible: 100 + 200 + 150 = 450 EUR -> 10% = 45 EUR discount available
  1001: [
    {
      orderId: 10001,
      posReference: "GRAND52345",
      orderDate: new Date("2024-11-15"),
      state: "paid",
      items: [
        { ...products[0], orderLineId: 1, quantity: 2, discountEligible: true }, // 50 x 2 = 100
      ],
    },
    {
      orderId: 10002,
      posReference: "GRAND52346",
      orderDate: new Date("2024-11-20"),
      state: "paid",
      items: [
        { ...products[1], orderLineId: 1, quantity: 1, discountEligible: true }, // 120
        { ...products[2], orderLineId: 2, quantity: 1, discountEligible: true }, // 80
      ],
    },
    {
      orderId: 10003,
      posReference: "GRAND52347",
      orderDate: new Date("2024-12-01"),
      state: "paid",
      items: [
        { ...products[3], orderLineId: 1, quantity: 1, discountEligible: true }, // 95
        { ...products[5], orderLineId: 2, quantity: 1, discountEligible: false }, // 35 (sale item)
        { ...products[7], orderLineId: 3, quantity: 1, discountEligible: false }, // 45 (sale item)
      ],
    },
  ],

  // John Smith (Customer 2) - Has 2 orders with mixed eligibility
  // Discount eligible: 80 + 75 = 155 EUR -> 10% = 15.50 EUR discount available
  1002: [
    {
      orderId: 20001,
      posReference: "GRAND09867",
      orderDate: new Date("2024-10-25"),
      state: "paid",
      items: [
        { ...products[2], orderLineId: 1, quantity: 1, discountEligible: true }, // 80
        { ...products[5], orderLineId: 2, quantity: 2, discountEligible: false }, // 35 x 2 = 70 (sale)
      ],
    },
    {
      orderId: 20002,
      posReference: "GRAND09868",
      orderDate: new Date("2024-11-10"),
      state: "paid",
      items: [
        { ...products[4], orderLineId: 1, quantity: 1, discountEligible: true }, // 75
        { ...products[7], orderLineId: 2, quantity: 1, discountEligible: false }, // 45 (sale)
      ],
    },
  ],

  // Maria Schmidt (Customer 3) - Has 4 orders for grouping test
  // Discount eligible: 50 + 120 + 95 + 110 = 375 EUR -> 10% = 37.50 EUR discount available
  1003: [
    {
      orderId: 30001,
      posReference: "GRAND11111",
      orderDate: new Date("2024-09-15"),
      state: "completed",
      items: [
        { ...products[0], orderLineId: 1, quantity: 1, discountEligible: true }, // 50
      ],
    },
    {
      orderId: 30002,
      posReference: "GRAND11112",
      orderDate: new Date("2024-10-01"),
      state: "completed",
      items: [
        { ...products[1], orderLineId: 1, quantity: 1, discountEligible: true }, // 120
      ],
    },
    {
      orderId: 30003,
      posReference: "GRAND11113",
      orderDate: new Date("2024-10-20"),
      state: "paid",
      items: [
        { ...products[3], orderLineId: 1, quantity: 1, discountEligible: true }, // 95
      ],
    },
    {
      orderId: 30004,
      posReference: "GRAND11114",
      orderDate: new Date("2024-11-05"),
      state: "paid",
      items: [
        { ...products[6], orderLineId: 1, quantity: 1, discountEligible: true }, // 110
      ],
    },
  ],

  // Peter Müller (Customer 4) - Large order for high discount test
  // Discount eligible: 120 + 80 + 95 + 110 + 75 = 480 EUR -> 10% = 48 EUR discount available
  1004: [
    {
      orderId: 40001,
      posReference: "GRAND22222",
      orderDate: new Date("2024-11-25"),
      state: "paid",
      items: [
        { ...products[1], orderLineId: 1, quantity: 1, discountEligible: true }, // 120
        { ...products[2], orderLineId: 2, quantity: 1, discountEligible: true }, // 80
        { ...products[3], orderLineId: 3, quantity: 1, discountEligible: true }, // 95
        { ...products[6], orderLineId: 4, quantity: 1, discountEligible: true }, // 110
        { ...products[4], orderLineId: 5, quantity: 1, discountEligible: true }, // 75
      ],
    },
  ],

  // Anna Weber (Customer 5) - Mixed orders with some already redeemed
  // Active discount eligible: 50 + 35 = 85 EUR -> 10% = 8.50 EUR discount available
  1005: [
    {
      orderId: 50001,
      posReference: "GRAND33333",
      orderDate: new Date("2024-08-15"),
      state: "completed",
      items: [
        { ...products[0], orderLineId: 1, quantity: 1, discountEligible: true }, // 50
        { ...products[5], orderLineId: 2, quantity: 1, discountEligible: true }, // 35
      ],
    },
    {
      orderId: 50002,
      posReference: "GRAND33334",
      orderDate: new Date("2024-09-20"),
      state: "completed",
      items: [
        { ...products[4], orderLineId: 1, quantity: 2, discountEligible: false }, // Already used
      ],
    },
  ],

  // Thomas Fischer (Customer 6) - No discount eligible items (all sale items)
  1006: [
    {
      orderId: 60001,
      posReference: "GRAND44444",
      orderDate: new Date("2024-11-30"),
      state: "paid",
      items: [
        { ...products[5], orderLineId: 1, quantity: 3, discountEligible: false }, // 35 x 3 = 105 (sale)
        { ...products[7], orderLineId: 2, quantity: 2, discountEligible: false }, // 45 x 2 = 90 (sale)
      ],
    },
  ],
};

// Seed function
const seedDB = async () => {
  try {
    // Clear existing data
    await User.deleteMany();
    await Customer.deleteMany();
    await Order.deleteMany();
    await Discount.deleteMany();
    await DiscountOrder.deleteMany();

    console.log("Cleared existing data...");

    // Create admin user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminUser.password, salt);
    await User.create({ ...adminUser, password: hashedPassword });
    console.log("Admin user created: admin@grandios.com / password123");

    // Create customers
    const createdCustomers = await Customer.insertMany(customers);
    console.log(`Created ${createdCustomers.length} customers`);

    // Create orders for each customer
    for (const customer of createdCustomers) {
      const ordersData = customerOrders[customer.contactId] || [];

      for (const orderData of ordersData) {
        // Calculate item totals
        const items = orderData.items.map((item) => ({
          orderLineId: item.orderLineId,
          productId: item.productId,
          productName: item.productName,
          priceUnit: item.priceUnit,
          quantity: item.quantity,
          discount: 0,
          priceSubtotal: item.priceUnit,
          priceSubtotalIncl: item.priceUnit, // Simplified for testing
          image: item.image,
          color: item.color,
          material: item.material,
          discountEligible: item.discountEligible,
        }));

        const amountTotal = items.reduce(
          (sum, item) => sum + item.priceSubtotalIncl * item.quantity,
          0
        );

        await Order.create({
          orderId: orderData.orderId,
          posReference: orderData.posReference,
          customerId: customer._id,
          partnerId: customer.contactId,
          orderDate: orderData.orderDate,
          amountTotal,
          amountPaid: amountTotal,
          amountTax: amountTotal * 0.19,
          state: orderData.state,
          cashier: "Admin",
          isInvoiced: orderData.state === "completed",
          isRefunded: false,
          items,
        });
      }

      // Calculate discount eligible amount for this customer
      const customerOrdersData = customerOrders[customer.contactId] || [];
      let totalDiscountEligible = 0;

      for (const orderData of customerOrdersData) {
        for (const item of orderData.items) {
          if (item.discountEligible) {
            totalDiscountEligible += item.priceUnit * item.quantity;
          }
        }
      }

      const discountBalance = totalDiscountEligible * 0.1; // 10% discount

      // Create discount wallet for customer
      await Discount.create({
        customerId: customer._id,
        partnerId: customer.contactId,
        balance: discountBalance,
        status: 1,
        totalGranted: discountBalance,
        totalRedeemed: 0,
      });

      console.log(
        `Created orders for ${customer.name}: ${customerOrdersData.length} orders, discount balance: €${discountBalance.toFixed(2)}`
      );
    }

    console.log("\n✅ Database seeded successfully!");
    console.log("\n--- Test Data Summary ---");
    console.log("Customer 1 (Jane Doe): 3 orders, €39.50 discount available");
    console.log("Customer 2 (John Smith): 2 orders, €15.50 discount available");
    console.log("Customer 3 (Maria Schmidt): 4 orders, €37.50 discount available (great for grouping test)");
    console.log("Customer 4 (Peter Müller): 1 large order, €48.00 discount available");
    console.log("Customer 5 (Anna Weber): 2 orders, €8.50 discount available");
    console.log("Customer 6 (Thomas Fischer): 1 order, €0.00 discount (all sale items)");
    console.log("\n--- Login Credentials ---");
    console.log("Email: admin@grandios.com");
    console.log("Password: password123");

    process.exit(0);
  } catch (err) {
    console.error("Error seeding database:", err);
    process.exit(1);
  }
};

seedDB();
