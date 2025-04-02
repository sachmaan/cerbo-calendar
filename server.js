// Server to expose the scheduling API
import express from 'express';
import cors from 'cors';
import { getAppointmentTypes, getAvailability, bookAppointment } from './backend/availability.web.js';
import logger from './logger.js';

const app = express();
const PORT = process.env.PORT;

// Configure CORS to allow requests from frontend
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*', // Allow all origins by default, or specify in env var
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Allow cookies to be sent with requests
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Log all requests for debugging
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.url}`, { 
    query: req.query, 
    body: req.body,
    headers: req.headers
  });
  next();
});

// API Endpoints
app.get('/api/appointment-types', async (req, res) => {
  try {
    logger.debug('Getting appointment types');
    const response = await getAppointmentTypes();
    logger.debug('Appointment types response', response);
    res.json(response);
  } catch (error) {
    logger.error('Error fetching appointment types:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch appointment types' });
  }
});

app.get('/api/availability', async (req, res) => {
  try {
    // Extract and validate query parameters
    const appointmentTypeId = req.query.appointmentTypeId ? Number(req.query.appointmentTypeId) : null;
    const startDate = req.query.startDate ? String(req.query.startDate) : null;
    const endDate = req.query.endDate ? String(req.query.endDate) : null;
    
    logger.debug('Getting availability', { appointmentTypeId, startDate, endDate });
    
    if (!appointmentTypeId || !startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: appointmentTypeId, startDate, and endDate are required' 
      });
    }
    
    const response = await getAvailability(appointmentTypeId, startDate, endDate);
    logger.debug('Availability response', response);
    res.json(response);
  } catch (error) {
    logger.error('Error fetching availability:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch availability' });
  }
});

app.post('/api/book-appointment', async (req, res) => {
  try {
    const { patientName, email, startTime, appointmentTypeId } = req.body;
    
    logger.debug('Booking appointment', { patientName, email, startTime, appointmentTypeId });
    
    if (!patientName || !email || !startTime || !appointmentTypeId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: patientName, email, startTime, and appointmentTypeId are required' 
      });
    }
    
    // Validate email format
    if (!email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    
    // Convert appointmentTypeId to string if it's a number
    const typeId = String(appointmentTypeId);
    
    const response = await bookAppointment(patientName, email, startTime, typeId);
    logger.debug('Booking response', response);
    res.json(response);
  } catch (error) {
    logger.error('Error booking appointment:', error);
    res.status(500).json({ success: false, error: 'Failed to book appointment' });
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
