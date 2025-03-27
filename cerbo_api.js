// cerbo_api.js
import { authHeader, baseUrl } from './api_token.js';
import logger from './logger.js';

/**
 * Retrieves provider availability for the specified date range
 * 
 * @param {Array<string|number>|string|number} providerIds - One or more provider IDs
 * @param {string|Date} startDate - Start date in YYYY-MM-DD format or Date object
 * @param {string|Date} endDate - End date in YYYY-MM-DD format or Date object
 * @returns {Promise<AvailabilityResponse>} Availability response object
 * @throws {Error} If the API request fails
 */
export async function getAvailability(providerIds, startDate, endDate) {
  try {
    // Convert to array if single value
    const providerIdArray = Array.isArray(providerIds) ? providerIds : [providerIds];
    
    // Create URL parameters
    const params = new URLSearchParams();
    
    // Add each provider ID with the correct parameter name format
    providerIdArray.forEach(id => {
      params.append('provider_ids[]', id.toString());
    });
    
    // Add date parameters
    params.append('start_date', formatDateForApi(startDate));
    params.append('end_date', formatDateForApi(endDate));
    
    const url = buildUrl(`${baseUrl}/appointments/availability`, params);
    
    logger.info("Availability Request URL:", url);
    logger.info("Availability Request authHeader:", authHeader);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`API error (${response.status} ${response.statusText}):`, errorText);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return AvailabilityResponse.fromJson(data);
  } catch (error) {
    logger.error('Error retrieving availability:', error);
    throw error;
  }
}

/**
 * Retrieves all appointments for the specified provider and date range
 * 
 * @param {string|number} providerId - The provider ID
 * @param {string|Date} startDate - Start date in YYYY-MM-DD format or Date object
 * @param {string|Date} endDate - End date in YYYY-MM-DD format or Date object 
 * @returns {Promise<AppointmentsResponse>} Appointments response object
 * @throws {Error} If the API request fails
 */
export async function getAllAppointments(providerId, startDate, endDate) {
  try {
    const params = new URLSearchParams({
      provider_id: providerId.toString(),
      start_date: formatDateForApi(startDate),
      end_date: formatDateForApi(endDate)
    });
    
    const url = buildUrl(`${baseUrl}/appointments`, params);
    
    logger.info("All Appointments Request URL:", url);
    logger.info("Appointments Request authHeader:", authHeader);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`API error (${response.status} ${response.statusText}):`, errorText);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return AppointmentsResponse.fromJson(data);
  } catch (error) {
    logger.error('Error retrieving appointments:', error);
    throw error;
  }
}

/**
 * Creates a new appointment
 * 
 * @param {AppointmentRequest} appointmentRequest - The appointment request object
 * @returns {Promise<CreateAppointmentResponse>} Create appointment response object
 * @throws {Error} If the API request fails
 */
export async function createAppointment(appointmentRequest) {
  try {
    const url = `${baseUrl}/appointments`;
    
    logger.info("Create Appointment URL:", url);
    logger.info("Create Appointment Request:", JSON.stringify(appointmentRequest, null, 2));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(appointmentRequest)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`API error (${response.status} ${response.statusText}):`, errorText);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return CreateAppointmentResponse.fromJson(data);
  } catch (error) {
    logger.error('Error creating appointment:', error);
    throw error;
  }
}

/**
 * Creates a new task in Cerbo
 * 
 * @param {Object} taskData - The task data
 * @param {number} taskData.dr_id - Doctor/Provider ID
 * @param {string} taskData.subject - Task subject
 * @param {string} [taskData.priority='low'] - Task priority (low, medium, high)
 * @param {string} taskData.notes - Task notes/description
 * @param {number} [taskData.pt_id] - Optional patient ID
 * @param {string} taskData.due_date - Due date in ISO format
 * @param {number} [taskData.remind_minutes_before] - Minutes before to send reminder
 * @returns {Promise<Object>} Task creation response object
 * @throws {Error} If the API request fails
 */
export async function createTask(taskData) {
  try {
    const url = `${baseUrl}/tasks`;
    
    logger.info("Create Task URL:", url);
    logger.info("Create Task Request:", JSON.stringify(taskData, null, 2));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(taskData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`API error (${response.status} ${response.statusText}):`, errorText);
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    logger.info("Task created successfully:", JSON.stringify(data, null, 2));
    return { 
      success: true,
      taskId: data.id,
      data
    };
  } catch (error) {
    logger.error('Error creating task:', error);
    throw error;
  }
}

// Helper classes and functions
/**
 * Class representing an availability response from the Cerbo API
 * @class
 */
export class AvailabilityResponse {
  /**
   * Create an availability response
   * 
   * @param {Array<Object>} userAvailabilities - Array of provider availability data
   *        Each provider object contains:
   *        - provider_id {string} - The provider's unique identifier
   *        - provider_name {string} - The provider's name
   *        - availability_by_type {Array<Object>} - Availability organized by appointment type
   *          Each availability_by_type object contains:
   *          - appointment_type {string} - The appointment type identifier
   *          - available_windows {Array<Object>} - Array of availability windows
   *            Each available_window object contains:
   *            - window_start {Date} - The start time of the availability window
   *            - window_end {Date} - The end time of the availability window
   */
  constructor(userAvailabilities) {
    this.userAvailabilities = userAvailabilities;
  }

  /**
   * Create an AvailabilityResponse instance from JSON
   * 
   * @param {Object} json - The JSON response from the API
   * @returns {AvailabilityResponse} A new AvailabilityResponse instance with Date objects for all time values
   */
  static fromJson(json) {
    const userAvailabilities = json.user_availabilies || [];
    const gmtTimezoneOffset = json.gmt_timezone_offset || '';
    
    // Convert string times to Date objects with proper timezone handling
    userAvailabilities.forEach(provider => {
      if (provider.availability_by_type) {
        provider.availability_by_type.forEach(type => {
          if (type.available_windows) {
            type.available_windows.forEach(window => {
              // First, ensure the format is ISO compatible
              let timeStr = window.window_start;
              // Replace space with 'T' if needed
              if (timeStr.includes(' ')) {
                timeStr = timeStr.replace(' ', 'T');
              }
              // Append timezone offset
              window.window_start = new Date(`${timeStr}${gmtTimezoneOffset}`);

              // First, ensure the format is ISO compatible
              timeStr = window.window_end;
              // Replace space with 'T' if needed
              if (timeStr.includes(' ')) {
                timeStr = timeStr.replace(' ', 'T');
              }
              // Append timezone offset
              window.window_end = new Date(`${timeStr}${gmtTimezoneOffset}`);
            });
          }
        });
      }
    });
    
    return new AvailabilityResponse(userAvailabilities);
  }
}

/**
 * Class representing an appointments response from the Cerbo API
 * @class
 */
export class AppointmentsResponse {
  /**
   * Create an appointments response
   * 
   * @param {Array<Object>} appointments - Array of appointment objects with Date objects for time fields
   *        Each appointment object contains:
   *        - id {string|number} - The appointment's unique identifier
   *        - title {string} - The appointment title
   *        - appointment_type {string} - The appointment type internal name
   *        - start_date_time {Date} - The appointment start time
   *        - end_date_time {Date} - The appointment end time
   *        - appointment_status {string} - The status of the appointment
   *        - created_at {Date} - When the appointment was created
   *        - updated_at {Date} - When the appointment was last updated
   *        - associated_providers {Array<Object>} - Providers associated with this appointment
   */
  constructor(appointments) {
    this.appointments = appointments;
  }

  /**
   * Create an AppointmentsResponse instance from JSON
   * 
   * @param {Object} json - The JSON response from the API
   * @param {Array<Object>} [json.data] - Array of appointment data from the API
   * @returns {AppointmentsResponse} A new AppointmentsResponse instance with Date objects for all time values
   */
  static fromJson(json) {
    // The API returns appointments in the "data" array
    const appointments = json.data || [];
    
    // Convert string times to Date objects with proper UTC handling
    appointments.forEach(appointment => {
      // Convert start_date_time to Date object with UTC handling
      if (appointment.start_date_time) {
        // Ensure proper UTC handling by appending 'Z' if not present
        const startTime = appointment.start_date_time.endsWith('Z') 
          ? appointment.start_date_time 
          : `${appointment.start_date_time}Z`;
        appointment.start_date_time = new Date(startTime);
      }
      
      // Convert end_date_time to Date object with UTC handling
      if (appointment.end_date_time) {
        // Ensure proper UTC handling by appending 'Z' if not present
        const endTime = appointment.end_date_time.endsWith('Z') 
          ? appointment.end_date_time 
          : `${appointment.end_date_time}Z`;
        appointment.end_date_time = new Date(endTime);
      }
      
      // Convert created_at to Date object
      if (appointment.created_at) {
        appointment.created_at = new Date(appointment.created_at);
      }
      
      // Convert updated_at to Date object
      if (appointment.updated_at) {
        appointment.updated_at = new Date(appointment.updated_at);
      }

      if (appointment.appointment_type) {
        appointment.appointment_type_internal_name = appointment.appointment_type;
      }
      

    });
    
    return new AppointmentsResponse(appointments);
  }
}

/**
 * Class representing a create appointment response from the API
 */
export class CreateAppointmentResponse {
  /**
   * Create a create appointment response
   * 
   * @param {Object} appointment - The created appointment or null if failed
   *        The appointment object contains:
   *        - id {string|number} - The appointment ID
   *        - title {string} - The appointment title
   *        - status {string} - The appointment status
   *        - start_date_time {string} - The appointment start time
   *        - end_date_time {string} - The appointment end time
   *        - appointment_type_internal_name {string} - The type of appointment
   *        - provider_id {number|string} - The provider ID
   */
  constructor(appointment) {
    this.appointment = appointment;
    this.success = !!appointment;
  }

  /**
   * Create a CreateAppointmentResponse instance from JSON
   * 
   * @param {Object} json - The JSON response from the API
   * @returns {CreateAppointmentResponse} A new CreateAppointmentResponse instance
   */
  static fromJson(json) {
    // Check if response contains an appointment object
    if (!json || json.error) {
      return new CreateAppointmentResponse(null);
    }
    
    // Parse the appointment data
    const appointment = {
      id: json.id,
      title: json.title,
      status: json.appointment_status,
      start_date_time: json.start_date_time,
      end_date_time: json.end_date_time,
      appointment_type_internal_name: json.appointment_type,
      provider_id: json.associated_providers?.[0]?.id || null
    };
    
    return new CreateAppointmentResponse(appointment);
  }
}

/**
 * Format a date for API requests
 * 
 * @param {string|Date|any} date - The date to format
 * @returns {string} The formatted date in YYYY-MM-DD format
 */
function formatDateForApi(date) {
  // If it's already a string in YYYY-MM-DD format, return it
  if (typeof date === 'string') {
    // If it has a T separator (ISO format), split and take date part
    if (date.includes('T')) {
      return date.split('T')[0];
    }
    return date; // Assume it's already in YYYY-MM-DD format
  }
  
  // If it's a Date object, format it as YYYY-MM-DD
  if (date instanceof Date) {
    return date.toISOString().split('T')[0];
  }
  
  // For other types, try to create a date from it
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      throw new Error('Invalid date');
    }
    return dateObj.toISOString().split('T')[0];
  } catch (error) {
    console.error('Error formatting date:', date, error);
    // Return current date as fallback
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Build a URL with query parameters
 * 
 * @param {string} baseUrl - The base URL
 * @param {URLSearchParams} params - The query parameters
 * @returns {string} The full URL with query parameters
 */
function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  
  if (params) {
    url.search = params.toString();
  }
  
  return url.toString();
}

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Whether the API call was successful
 * @property {string} [error] - Error message if the call failed
 */

/**
 * @typedef {Object} AppointmentRequest
 * @property {string} start_date_time - Start time of the appointment
 * @property {string} end_date_time - End time of the appointment
 * @property {number[]} provider_ids - Array of provider IDs
 * @property {string} appointment_type - Type of appointment
 * @property {string} title - Title of the appointment
 * @property {string} appointment_note - Note for the appointment
 * @property {string} status - Status of the appointment (e.g., "scheduled")
 * @property {boolean} telemedicine - Whether this is a telemedicine appointment
 */

/**
 * @typedef {Object} Provider
 * @property {number|string} id - The provider ID
 * @property {string} first_name - Provider's first name
 * @property {string} last_name - Provider's last name
 * @property {string} [email] - Provider's email
 */
