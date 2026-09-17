require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const productRoutes = require('./routes/productRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');
const quotationRoutes = require('./routes/quotationRoutes');
const salesOrderRoutes = require('./routes/salesOrderRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api', (req, res) => {
  res.json({
    name: 'Mini ERP API',
    version: '1.0.0',
    base: '/api',
    endpoints: [
      'POST /api/auth/login',
      'GET /api/auth/me',
      'POST|GET /api/customers',
      'POST|GET /api/enquiries',
      'POST|GET /api/quotations',
      'GET /api/products',
      'GET /api/products/inventory/all',
      'GET /api/sales-orders',
      'GET /api/health',
    ],
  });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'ERP API', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/sales-orders', salesOrderRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

const distDir = path.join(__dirname, '..', 'frontend', 'dist');
app.use(
  express.static(distDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  })
);
app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'), {
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`ERP API server running on http://localhost:${PORT}`);
  });
}

module.exports = app;