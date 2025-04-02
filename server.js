// Server to expose the scheduling API
import express from 'express';
import cors from 'cors';
import { getAppointmentTypes, getAvailability, bookAppointment } from './backend/availability.web.js';
import logger from './logger.js';

// Simple in-memory storage for time slots, organized by session ID
const timeSlotCache = new Map();

// Generate a random UUID without external dependencies
function generateId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15) +
         Date.now().toString(36);
}

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

// Simple session middleware that assigns a session ID via cookies
app.use((req, res, next) => {
  // Check for existing session ID in cookies
  let sessionId = req.headers.cookie?.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('sessionId='))
    ?.split('=')[1];
  
  // If no session ID, create a new one
  if (!sessionId) {
    sessionId = generateId();
    res.setHeader('Set-Cookie', `sessionId=${sessionId}; Path=/; HttpOnly; Max-Age=3600`);
  }
  
  // Attach session ID to request object
  req.sessionId = sessionId;
  
  // Initialize time slot cache for this session if it doesn't exist
  if (!timeSlotCache.has(sessionId)) {
    timeSlotCache.set(sessionId, { lastAccessed: Date.now(), cache: new Map() });
  } else {
    const sessionCache = timeSlotCache.get(sessionId);
    sessionCache.lastAccessed = Date.now();
  }
  
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
    
    // Clear previous cache for this session
    const sessionCache = timeSlotCache.get(req.sessionId);
    sessionCache.cache.clear();
    
    // Cache the time slots with UUID keys
    if (response.success && response.availableSlots) {
      const slotsWithIds = response.availableSlots.map(slot => {
        const slotId = generateId();
        // Store the complete slot in session cache
        sessionCache.cache.set(slotId, slot);
        
        // Return a limited version of the slot with the UUID
        return {
          id: slotId,
          startTime: slot.primaryBooking ? slot.primaryBooking.startTime : slot.startTime,
          endTime: slot.endTime,
          hasDualBooking: slot.hasDualBooking,
          hasBuffer: !!slot.buffer
        };
      });
      
      // Replace the full slots with the limited versions that include UUIDs
      response.availableSlots = slotsWithIds;
      
      logger.debug(`Cached ${slotsWithIds.length} time slots for session ${req.sessionId}`);
    }
    
    logger.debug('Availability response (with IDs)', {
      success: response.success,
      slotCount: response.availableSlots?.length
    });
    
    res.json(response);
  } catch (error) {
    logger.error('Error fetching availability:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch availability' });
  }
});

app.post('/api/book-appointment', async (req, res) => {
  try {
    const { patientName, email, slotId } = req.body;
    
    logger.debug('Booking appointment request', { 
      patientName, 
      email, 
      slotId,
      sessionId: req.sessionId
    });
    
    // Validate required fields
    if (!patientName || !email || !slotId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: patientName, email, and slotId are required' 
      });
    }
    
    // Validate email format
    if (!email.includes('@')) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    
    // Get the session cache
    const sessionCache = timeSlotCache.get(req.sessionId);
    
    if (!sessionCache) {
      return res.status(400).json({ 
        success: false, 
        error: 'No active session found. Please refresh and try again.' 
      });
    }
    
    // Retrieve the time slot from session cache
    const timeSlot = sessionCache.cache.get(slotId);
    
    if (!timeSlot) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invalid or expired time slot. Please refresh and try again.' 
      });
    }
    
    logger.debug('Retrieved time slot from cache', { timeSlot });
    
    // Book the appointment using the retrieved time slot
    const response = await bookAppointment(patientName, email, timeSlot);
    
    // Remove the used time slot from cache
    sessionCache.cache.delete(slotId);
    
    logger.debug('Booking response', response);
    res.json(response);
  } catch (error) {
    logger.error('Error booking appointment:', error);
    res.status(500).json({ success: false, error: 'Failed to book appointment' });
  }
});

// Clean up expired sessions periodically (every hour)
setInterval(() => {
  const now = Date.now();
  // Session timeout: 1 hour
  const sessionTimeout = 60 * 60 * 1000;
  
  for (const [sessionId, sessionCache] of timeSlotCache.entries()) {
    const lastAccessed = sessionCache.lastAccessed || 0;
    if (now - lastAccessed > sessionTimeout) {
      timeSlotCache.delete(sessionId);
      logger.debug(`Cleaned up expired session: ${sessionId}`);
    }
  }
}, 60 * 60 * 1000); // Run cleanup every hour

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
