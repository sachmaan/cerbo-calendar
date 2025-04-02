import axios from 'axios';

// API URL Configuration:
// 1. During development: Uses REACT_APP_API_URL from .env file
// 2. In production Docker: The string 'RUNTIME_API_URL' gets replaced at container startup
// This approach allows runtime configuration when deploying to different environments
const API_URL = process.env.REACT_APP_API_URL || 'RUNTIME_API_URL' || 'http://localhost:3001/api';

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
