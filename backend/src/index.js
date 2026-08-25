import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { db } from './db.js';

import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import inventoryRoutes from './routes/inventory.js';
import orderRoutes from './routes/orders.js';
import tableRoutes from './routes/tables.js';
import staffRoutes from './routes/staff.js';
import customerRoutes from './routes/customers.js';
import financeRoutes from './routes/finance.js';
import reportRoutes from './routes/reports.js';
import waiterRoutes from './routes/waiters.js';
import shiftHandoverRoutes from './routes/shifts_handover.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', tableRoutes); // /api/tables, /api/reservations
app.use('/api/staff', staffRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/waiters', waiterRoutes);
app.use('/api/shift-handovers', shiftHandoverRoutes);

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Cafe management API running on http://localhost:${PORT}`);
});
