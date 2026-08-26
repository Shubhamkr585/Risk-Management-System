/**
 * @file seedCustomers.js
 * @description Database Seeder module for Customer Return Risk Analyzer.
 * Populates MongoDB with realistic 1-to-many customer order and return data,
 * creating linked Return records, Customer summaries, and canonical ReturnRisk analysis entries.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from './models/Customer.js';
import Return from './models/Return.js';
import ReturnRisk from './models/ReturnRisk.js';
import { calculateCustomerRisk } from './utils/riskCalculator.js';

// Load environment variables from .env
dotenv.config({ path: './.env' });

/**
 * Connects to MongoDB using connection URI from environment configuration.
 * 
 * @async
 * @function connectDatabase
 * @returns {Promise<void>} Resolves when connection is established.
 */
const connectDatabase = async () => {
  const uri = process.env.ATLAS_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Database URI missing. Set ATLAS_URI or MONGODB_URI in .env');
  }
  await mongoose.connect(uri);
  console.log('MongoDB connection established successfully.');
};

/**
 * Product catalog configuration for generating realistic return transactions.
 */
const PRODUCT_CATALOG = [
  { name: '4K Ultra HD Smart TV 55"', category: 'Electronics', price: 699.99 },
  { name: 'Wireless Noise Canceling Headphones', category: 'Electronics', price: 299.99 },
  { name: 'Ergonomic Leather Gaming Chair', category: 'Home', price: 249.50 },
  { name: 'Designer Cashmere Winter Sweater', category: 'Fashion', price: 185.00 },
  { name: 'Stainless Steel Espresso Machine', category: 'Home', price: 449.00 },
  { name: 'Smart Fitness Watch Series 5', category: 'Electronics', price: 219.00 },
  { name: 'Organic Hydrating Skin Serum', category: 'Beauty', price: 65.00 },
  { name: 'Luxury Leather Handbag', category: 'Luxury', price: 1250.00 },
  { name: 'High-Performance Running Shoes', category: 'Fashion', price: 140.00 },
  { name: 'Blender Pro 1000W Heavy Duty', category: 'Home', price: 129.99 }
];

/**
 * List of standard and high-risk return reasons.
 */
const RETURN_REASONS = [
  'Size did not fit',
  'Changed mind',
  'Defective item',
  'Wrong item delivered',
  'Not as described',
  'Item damaged in transit',
  'Empty box claimed'
];

/**
 * Generates synthetic customer profile definitions categorized into risk tiers.
 * 
 * @function generateCustomerArchetypes
 * @param {number} count - Number of customer profiles to create.
 * @returns {Array<Object>} Array of raw customer profile definitions.
 */
const generateCustomerArchetypes = (count = 60) => {
  const archetypes = [];
  const firstNames = ['Alexander', 'Sophia', 'Liam', 'Olivia', 'Ethan', 'Ava', 'Mason', 'Isabella', 'Noah', 'Mia', 'Lucas', 'Charlotte', 'Benjamin', 'Amelia', 'Henry'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson'];

  for (let i = 1; i <= count; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i * 3) % lastNames.length];
    const customerId = `CUST-${1000 + i}`;
    const name = `${fn} ${ln}`;
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`;
    const address = `${100 + (i * 7)} Commerce St, Cityville, NY 1000${i % 9 + 1}`;

    // Determine risk distribution (60% Low, 25% Medium, 15% High/Critical)
    let totalOrders, totalReturns, avgSpendPerOrder;
    if (i % 7 === 0 || i % 11 === 0) {
      // High/Critical risk archetype: High returns (6 to 18 returns out of 10 to 22 orders)
      totalOrders = Math.floor(Math.random() * 12) + 10;
      totalReturns = Math.min(Math.floor(Math.random() * 12) + 6, totalOrders);
      avgSpendPerOrder = Math.floor(Math.random() * 300) + 150;
    } else if (i % 3 === 0) {
      // Medium risk archetype: Moderate returns (2 to 4 returns out of 10 to 20 orders)
      totalOrders = Math.floor(Math.random() * 10) + 10;
      totalReturns = Math.min(Math.floor(Math.random() * 3) + 2, totalOrders);
      avgSpendPerOrder = Math.floor(Math.random() * 150) + 80;
    } else {
      // Low risk archetype: Low returns (0 to 1 return out of 15 to 35 orders)
      totalOrders = Math.floor(Math.random() * 20) + 15;
      totalReturns = Math.random() < 0.3 ? 1 : 0;
      avgSpendPerOrder = Math.floor(Math.random() * 120) + 40;
    }

    const totalSpent = Number((totalOrders * avgSpendPerOrder).toFixed(2));
    const lastReturnDate = totalReturns > 0 
      ? new Date(Date.now() - (Math.floor(Math.random() * 80) + 2) * 24 * 60 * 60 * 1000)
      : null;

    archetypes.push({
      customerId,
      name,
      email,
      address,
      totalOrders,
      totalReturns,
      totalSpent,
      lastReturnDate
    });
  }

  return archetypes;
};

/**
 * Main seeding orchestrator function.
 * Clears database collections, inserts customers, generates multi-return history,
 * and creates linked ReturnRisk objects.
 * 
 * @async
 * @function seedDatabase
 * @returns {Promise<void>}
 */
const seedDatabase = async () => {
  try {
    await connectDatabase();

    console.log('Clearing existing Customer, Return, and ReturnRisk collections...');
    await Customer.deleteMany({});
    await Return.deleteMany({});
    await ReturnRisk.deleteMany({});

    console.log('Generating customer archetypes with multi-return profiles...');
    const customerArchetypes = generateCustomerArchetypes(60);

    const createdCustomers = [];
    const returnsToInsert = [];
    const returnRisksToInsert = [];

    let returnCounter = 1000;

    for (const data of customerArchetypes) {
      // Create Customer document
      const customerDoc = new Customer({
        customerId: data.customerId,
        name: data.name,
        email: data.email,
        address: data.address,
        totalOrders: data.totalOrders,
        totalReturns: data.totalReturns,
        totalSpent: data.totalSpent,
        lastReturnDate: data.lastReturnDate
      });

      await customerDoc.save();

      // Generate 1-to-many return documents for this customer if returns > 0
      for (let r = 0; r < data.totalReturns; r++) {
        returnCounter++;
        const prod = PRODUCT_CATALOG[r % PRODUCT_CATALOG.length];
        const reason = RETURN_REASONS[r % RETURN_REASONS.length];
        const returnDate = new Date(Date.now() - ((r * 10) + Math.floor(Math.random() * 5) + 1) * 24 * 60 * 60 * 1000);

        returnsToInsert.push({
          returnId: `RET-${returnCounter}`,
          orderId: `ORD-${50000 + returnCounter}`,
          customer: customerDoc._id,
          customerId: customerDoc.customerId,
          customerName: customerDoc.name,
          product: prod.name,
          productSku: `SKU-${100 + (r % 10)}`,
          productCategory: prod.category,
          productPrice: prod.price,
          reason: reason,
          status: r % 4 === 0 ? 'Pending' : (r % 3 === 0 ? 'Rejected' : 'Approved'),
          returnDate: returnDate
        });
      }

      // Calculate canonical risk score for customer
      const { riskScore, riskLevel, factors, returnRate } = calculateCustomerRisk(customerDoc);

      const riskFactorsMap = new Map(Object.entries(factors));
      const recommendations = [];

      if (riskLevel === 'High' || riskLevel === 'Critical') {
        recommendations.push('Review customer return history');
        recommendations.push('Consider limiting high-value return approvals');
        if (riskLevel === 'Critical') recommendations.push('Flag account for manual fraud review');
      } else if (riskLevel === 'Medium') {
        recommendations.push('Monitor return frequency');
      } else {
        recommendations.push('No immediate action required');
      }

      // Create linked ReturnRisk entry
      const returnRiskDoc = await ReturnRisk.create({
        customer: customerDoc._id,
        riskScore,
        riskLevel,
        source: 'local',
        modelVersion: 'customer-risk-v1',
        factors: riskFactorsMap,
        recommendations,
        analysisDate: new Date()
      });

      // Link ReturnRisk to customer
      customerDoc.riskAnalysis = returnRiskDoc._id;
      customerDoc.returnRate = returnRate;
      await customerDoc.save();

      createdCustomers.push(customerDoc);
    }

    // Insert all return documents in bulk
    if (returnsToInsert.length > 0) {
      await Return.insertMany(returnsToInsert);
    }

    console.log(`✅ Successfully seeded:`);
    console.log(`   - ${createdCustomers.length} Customers`);
    console.log(`   - ${returnsToInsert.length} Individual Return Transactions (1-to-many relationships)`);
    console.log(`   - ${createdCustomers.length} Canonical ReturnRisk Analysis Records`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  }
};

// Execute seeding pipeline
seedDatabase();
