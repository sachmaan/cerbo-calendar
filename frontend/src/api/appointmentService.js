import axios from 'axios';

// API URL Configuration - uses runtime config.js if available, falls back to environment variables
const getApiUrl = () => {
  // Check if window.ENV exists (runtime config from Docker)
  if (window.ENV && window.ENV.API_URL) {
    return window.ENV.API_URL;
  }
  
  // Fall back to React environment variable for development
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Default fallback
  return 'http://localhost:3001/api';
};

const API_URL = getApiUrl();

// Validate API URL is set
if (!API_URL) {
  console.error('ERROR: API_URL not configured. Please set REACT_APP_API_URL environment variable during build or provide a runtime configuration.');
  throw new Error('API URL not configured. Please set REACT_APP_API_URL environment variable during build or provide a runtime configuration.');
}

// Configure axios to include credentials for session cookies
axios.defaults.withCredentials = true;

/**
 * Fetches all available appointment types
 * @returns {Promise<Object>} Response with appointment types
 */
export const getAppointmentTypes = async () => {
  try {
    const response = await axios.get(`${API_URL}/appointment-types`);
    return response.data;
  } catch (error) {
    console.error('Error fetching appointment types:', error);
    return {
      success: false,
      error: error.response?.data?.error || 'Failed to fetch appointment types'
    };
  }
};

/**
 * Fetches available time slots for a specific appointment type and date range
 * @param {string|number} appointmentTypeId - ID of the appointment type
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Promise<Object>} Response with available time slots
 */
export const getAvailability = async (appointmentTypeId, startDate, endDate) => {
  try {
    const response = await axios.get(`${API_URL}/availability`, {
      params: {
        appointmentTypeId,
        startDate,
        endDate
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching availability:', error);
    return {
      success: false,
      error: error.response?.data?.error || 'Failed to fetch availability'
    };
  }
};

/**
 * Books an appointment with the provided details
 * @param {string} patientName - Name of the patient
 * @param {string} email - Email of the patient
 * @param {string} startTime - ISO string of the appointment start time
 * @param {string|number} appointmentTypeId - ID of the appointment type
 * @returns {Promise<Object>} Response with booked appointment details
 */
export const bookAppointment = async (patientName, email, startTime, appointmentTypeId) => {
  try {
    const response = await axios.post(`${API_URL}/book-appointment`, {
      patientName,
      email,
      startTime,
      appointmentTypeId
    });
    return response.data;
  } catch (error) {
    console.error('Error booking appointment:', error);
    return {
      success: false,
      error: error.response?.data?.error || 'Failed to book appointment'
    };
  }
};
