import axios from 'axios';

// Base API URL - will be configured in Docker to connect to the backend service
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

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
 * Books an appointment using a slot ID from the server-side cache
 * @param {string} patientName - Name of the patient
 * @param {string} email - Email of the patient
 * @param {string} slotId - ID of the selected time slot (from availability response)
 * @returns {Promise<Object>} Response with booked appointment details
 */
export const bookAppointment = async (patientName, email, slotId) => {
  try {
    // Build the request with the slot ID
    const requestData = {
      patientName,
      email,
      slotId
    };

    console.log('Sending booking request with data:', requestData);

    const response = await axios.post(`${API_URL}/book-appointment`, requestData);
    return response.data;
  } catch (error) {
    console.error('Error booking appointment:', error);
    return {
      success: false,
      error: error.response?.data?.error || 'Failed to book appointment'
    };
  }
};
