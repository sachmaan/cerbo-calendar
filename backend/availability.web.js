// backend/availability.web.js
import { getAvailability as getCerboAvailability, getAllAppointments, createAppointment, createTask as createCerboTask } from '../cerbo_api.js';
import { authHeader } from '../api_token.js';
import logger from '../logger.js';

/**
 * @typedef {Object} AppointmentTypeResponse
 * @property {boolean} success - Whether the operation was successful
 * @property {Array<Object>} [appointmentTypes] - List of appointment types if successful
 * @property {string} [error] - Error message if not successful
 */

/**
 * @typedef {Object} AvailabilityResponse
 * @property {boolean} success - Whether the operation was successful
 * @property {Array<Object>} [availableSlots] - List of available time slots if successful
 * @property {string} [error] - Error message if not successful
 */

/**
 * @typedef {Object} BookingResponse
 * @property {boolean} success - Whether the operation was successful
 * @property {Object} [appointment] - The booked appointment if successful
 * @property {string} [message] - Success message if successful
 * @property {string} [error] - Error message if not successful
 */

/**
 * @typedef {Object} PhysioSpaAppointmentTypeInfo
 * @property {string} id - The appointment type ID
 * @property {string} displayName - Display name for the appointment type
 * @property {string} internalName - Internal name for the appointment type
 * @property {number} duration - Duration in minutes
 * @property {boolean} dualBookable - Whether this appointment can be double-booked
 */

/**
 * @typedef {Object} TimeSlot
 * @property {string} startTime - ISO datetime string for the slot start time
 * @property {string} endTime - ISO datetime string for the slot end time
 * @property {string} appointmentTypeId - ID of the appointment type
 * @property {boolean} [hasDualBooking] - Whether the slot already has a dual booking
 */

// Models for PhysioSpa appointment types
class PhysioSpaAppointmentType {
  /**
   * Create a PhysioSpa appointment type
   * 
   * @param {number} id - The appointment type ID
   * @param {string} displayName - Display name for the appointment type
   * @param {string} internalName - Internal name for the appointment type
   * @param {number} duration - Duration in minutes
   * @param {boolean} dualBookable - Whether this appointment can be double-booked
   */
  constructor(id, displayName, internalName, duration, dualBookable) {
    this.id = id;
    this.displayName = displayName;
    this.internalName = internalName;
    this.duration = duration;
    this.dualBookable = dualBookable;
  }
}

// Constants
const PROVIDER_ID = 61; // Hard-coded provider ID for MVP
const ADMIN_FLEXIBLE_TYPE_ID = 135; // ID for ADMIN_FLEXIBLE appointment type
const BUFFER_DURATION = 30; // 30-minute buffer

// Appointment types configuration
const appointmentTypes = [
  new PhysioSpaAppointmentType(151, "Acupuncture", "Acupuncture.Follow-up, self-schd (50 min)", 60, false),
  new PhysioSpaAppointmentType(144, "Vagus Nerve Stem Therapy", "Vagus Nerve Stem Therapy- Initial", 30, true),
  new PhysioSpaAppointmentType(ADMIN_FLEXIBLE_TYPE_ID, "ADMIN-Flexible", "ADMIN-Flexible", 30, false) // Used for buffer slots
];

// Cache for performance in development
const globalCache = typeof global !== 'undefined' ? global : window;
if (!globalCache.availabilityCache) globalCache.availabilityCache = null;
if (!globalCache.appointmentsCache) globalCache.appointmentsCache = null;

/**
 * Use Case 1: Get available appointment types
 * Returns a list of appointment types with display names and IDs
 * 
 * @returns {Promise<AppointmentTypeResponse>} Response with available appointment types
 */
export async function getAppointmentTypes() {
  try {
    // Filter out the ADMIN_FLEXIBLE type (that's our buffer type)
    const filteredAppointmentTypes = appointmentTypes.filter(type => 
      type.id !== ADMIN_FLEXIBLE_TYPE_ID
    );
    
    // Format response
    const response = {
      success: true,
      appointmentTypes: filteredAppointmentTypes.map(type => ({
        id: type.id,
        displayName: type.displayName
      }))
    };
    
    return response;
  } catch (error) {
    logger.error('Error getting appointment types:', error);
    return {
      success: false,
      error: error.message || 'Failed to retrieve appointment types'
    };
  }
}

/**
 * Use Case 2: Get availability for a selected appointment type
 * Takes an appointment type ID and returns available time slots
 * 
 * @param {number} appointmentTypeId - The ID of the appointment type to check availability for
 * @param {string|Date} startDate - Start date to check availability from
 * @param {string|Date} endDate - End date to check availability until
 * @returns {Promise<AvailabilityResponse>} Response with available time slots
 */
export async function getAvailability(appointmentTypeId, startDate, endDate) {
  try {
    logger.debug('getAvailability called with:', {
      appointmentTypeId: appointmentTypeId,
      startDate: startDate,
      endDate: endDate
    });
    
    // Validate input
    if (!appointmentTypeId || !startDate || !endDate) {
      logger.debug('Missing required parameters');
      return {
        success: false,
        error: "Missing required parameters"
      };
    }

    // Find the appointment type configuration
    const appointmentType = appointmentTypes.find(type => 
      type.id === appointmentTypeId
    );
    
    if (!appointmentType) {
      logger.debug('Appointment type not found');
      throw new Error(`Appointment type with ID ${appointmentTypeId} not found`);
    }
    logger.debug('Found appointment type:', appointmentType);

    // Get provider availability from Cerbo API
    logger.debug('Getting provider availability from Cerbo');
    const availabilityResponse = await getCerboAvailability([PROVIDER_ID], startDate, endDate);
    logger.debug('Cerbo availability response:', availabilityResponse);
    
    // Get provider's scheduled appointments from Cerbo API
    logger.debug('Getting provider appointments from Cerbo');
    const appointmentsResponse = await getAllAppointments(PROVIDER_ID, startDate, endDate);
    logger.debug('Cerbo appointments response:', appointmentsResponse);

    // Cache these responses in session memory for use case 3
    globalCache.availabilityCache = availabilityResponse;
    globalCache.appointmentsCache = appointmentsResponse;

    // Calculate available slots based on business rules
    const availableSlots = calculateAvailableTimeSlots(
      availabilityResponse,
      appointmentsResponse,
      appointmentType
    );

    // Sort available time slots chronologically
    availableSlots.sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    return {
      success: true,
      availableSlots: availableSlots
    };
  } catch (error) {
    logger.error("Error in getAvailability:", error);
    return {
      success: false,
      error: "Failed to retrieve availability"
    };
  }
}

/**
 * Use Case 3: Book an appointment
 * Books a time slot and creates a buffer if needed
 * 
 * @param {string} patientName - Name of the patient
 * @param {string} email - Email of the patient
 * @param {string} startTime - ISO datetime string for the appointment start (in UTC)
 * @param {string} appointmentTypeId - ID of the appointment type to book
 * @returns {Promise<BookingResponse>} Response with booking details
 */
export async function bookAppointment(patientName, email, startTime, appointmentTypeId) {
  try {
    // Find the appointment type configuration
    const appointmentType = appointmentTypes.find(type => 
      String(type.id) === String(appointmentTypeId)
    );
    
    if (!appointmentType) {
      return {
        success: false,
        error: `Appointment type with ID ${appointmentTypeId} not found`
      };
    }

    // Get appointments to check for buffer requirement
    const appointmentsResponse = await getAllAppointments(PROVIDER_ID, startTime.substring(0, 10), startTime.substring(0, 10));
    
    // Create the appointment request
    const appointmentRequest = new AppointmentRequest(
      patientName, 
      email, 
      Number(PROVIDER_ID), 
      Number(appointmentTypeId), 
      new Date(startTime), 
      appointmentType.duration
    );
    
    // Book the appointment
    logger.info("Booking appointment with request:", JSON.stringify(appointmentRequest.toJson(), null, 2));
    const bookingResponse = await createAppointment(appointmentRequest.toJson());
    
    if (!bookingResponse.success) {
      return {
        success: false,
        error: "Failed to book appointment"
      };
    }
    
    // Check if we need to add a buffer appointment
    // For buffer check, we use the UTC time directly since appointments are in UTC
    if (wouldCauseConsecutiveWork(new Date(startTime), appointmentType.duration, appointmentsResponse.appointments || [], 60, 90)) {
      // Calculate buffer start time (in UTC)
      const bufferStartTime = calculateBufferStartTime(startTime, appointmentType.duration);
      
      // Create a buffer appointment
      const bufferRequest = new AppointmentRequest(
        "BUFFER", 
        "buffer@example.com", 
        Number(PROVIDER_ID), 
        Number(ADMIN_FLEXIBLE_TYPE_ID), 
        bufferStartTime, 
        Number(BUFFER_DURATION)
      );
      
      try {
        // Book the buffer appointment
        logger.info("Booking buffer appointment with request:", JSON.stringify(bufferRequest.toJson(), null, 2));
        await createAppointment(bufferRequest.toJson());
      } catch (error) {
        logger.error("Error booking buffer appointment:", error);
        // We don't fail the main booking if buffer fails
      }
    }
    
    // Create a task for the appointment
    try {
      await createTask(patientName, email, appointmentType, startTime, String(PROVIDER_ID));
    } catch (error) {
      logger.error("Error creating task:", error);
      // We don't fail the main booking if task creation fails
    }
    
    return {
      success: true,
      appointment: {
        patientName,
        email,
        providerId: PROVIDER_ID,
        appointmentTypeId,
        startTime,
        endTime: calculateEndTime(startTime, appointmentType.duration)
      }
    };
  } catch (error) {
    logger.error("Error booking appointment:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Class representing an actual available time slot with start and end times
 */
class ActualAvailableTimeSlot {
  /**
   * Create a new availability time slot
   * @param {Date} startTime - Start time of the slot
   * @param {Date} endTime - End time of the slot
   * @param {boolean} hasDualBooking - Whether this slot contains a dual booking already
   */
  constructor(startTime, endTime, hasDualBooking = false) {
    this.startTime = startTime;
    this.endTime = endTime;
    this.hasDualBooking = hasDualBooking;
  }

  /**
   * Check if this availability slot overlaps with a time period
   * @param {Date} otherStart - Start of the time period to check
   * @param {Date} otherEnd - End of the time period to check
   * @returns {boolean} True if there is overlap
   */
  overlaps(otherStart, otherEnd) {
    return this.startTime < otherEnd && this.endTime > otherStart;
  }

  /**
   * Check if a given time is within this availability slot
   * @param {Date} time - Time to check
   * @returns {boolean} True if the time is within this slot
   */
  contains(time) {
    return time >= this.startTime && time < this.endTime;
  }

  /**
   * Convert this slot to a TimeSlot object for API response
   * @param {string} appointmentTypeId - The appointment type ID for the slot
   * @returns {TimeSlot} A TimeSlot object for API response
   */
  toTimeSlot(appointmentTypeId) {
    return {
      startTime: this.startTime.toISOString(),
      endTime: this.endTime.toISOString(),
      appointmentTypeId: String(appointmentTypeId),
      hasDualBooking: this.hasDualBooking
    };
  }
}

/**
 * Helper function to calculate available time slots
 * Implements business rules for valid appointment times (top of hour and half hour)
 * 
 * @param {Object} availabilityResponse - Response from Cerbo API for provider availability
 * @param {Object} appointmentsResponse - Response from Cerbo API for provider's scheduled appointments
 * @param {PhysioSpaAppointmentType} appointmentType - The appointment type to check availability for
 * @returns {Array<TimeSlot>} Array of available time slots
 */
function calculateAvailableTimeSlots(availabilityResponse, appointmentsResponse, appointmentType) {
  const availableSlots = [];
  const providerAvailabilities = availabilityResponse.userAvailabilities || [];
  const scheduledAppointments = appointmentsResponse.appointments || [];
  const isDualBookable = appointmentType.dualBookable;
  const appointmentDuration = appointmentType.duration;
  
  // Step 1: Create discrete half-hour time slots from provider availability windows
  let candidateTimeSlots = [];
  
  for (const providerAvailability of providerAvailabilities) {
    for (const typeAvailability of providerAvailability.availability_by_type || []) {
      // Skip if this isn't for the requested appointment type
      if (String(typeAvailability.appointment_type_id) !== String(appointmentType.id)) {
        continue;
      }
      
      // Process each available window
      for (const window of typeAvailability.available_windows || []) {
        const windowStart = new Date(window.window_start); // Local time
        const windowEnd = new Date(window.window_end);     // Local time
        
        // Generate time slots at 30-minute intervals
        let currentSlotStart = new Date(windowStart);
        
        // Align to the nearest half hour (either 00 or 30 minutes)
        if (currentSlotStart.getMinutes() > 0 && currentSlotStart.getMinutes() < 30) {
          currentSlotStart.setMinutes(30, 0, 0);
        } else if (currentSlotStart.getMinutes() > 30) {
          currentSlotStart.setHours(currentSlotStart.getHours() + 1, 0, 0, 0);
        } else if (currentSlotStart.getMinutes() !== 0 && currentSlotStart.getMinutes() !== 30) {
          // If not exactly on the hour or half hour, move to the next half hour
          if (currentSlotStart.getMinutes() < 30) {
            currentSlotStart.setMinutes(30, 0, 0);
          } else {
            currentSlotStart.setHours(currentSlotStart.getHours() + 1, 0, 0, 0);
          }
        }
        
        // Create slots at every half hour until we reach the window end time
        while (currentSlotStart < windowEnd) {
          // Calculate the end time of this appointment
          const currentSlotEnd = new Date(currentSlotStart);
          currentSlotEnd.setMinutes(currentSlotEnd.getMinutes() + appointmentDuration);
          
          // Only add the slot if the entire appointment fits within the window
          if (currentSlotEnd <= windowEnd) {
            candidateTimeSlots.push(new ActualAvailableTimeSlot(
              new Date(currentSlotStart),
              new Date(currentSlotEnd)
            ));
          }
          
          // Move to the next half hour
          currentSlotStart.setMinutes(currentSlotStart.getMinutes() + 30);
        }
      }
    }
  }
  
  // If no candidate slots, return empty array
  if (candidateTimeSlots.length === 0) {
    return [];
  }
  
  // Step 2: For each candidate time slot, check if it would create continuous work exceeding 60 minutes
  // Get a list of appointment types to ignore in work block calculations
  const typesToIgnore = getAppointmentTypesToIgnore();
  
  // Filter existing appointments to only include work appointments
  const workAppointments = scheduledAppointments.filter(appointment => {
    // Check if the appointment has an internal name that corresponds to a type we should ignore
    if (appointment.appointment_type_internal_name) {
      const typeId = getAppointmentTypeIdFromInternalName(appointment.appointment_type_internal_name);
      if (typeId && typesToIgnore.includes(typeId)) {
        return false;
      }
    }
    return true;
  });
  
  // Sort appointments chronologically
  workAppointments.sort((a, b) => {
    return new Date(a.start_date_time).getTime() - new Date(b.start_date_time).getTime();
  });
  
  // Process dual-bookable appointments separately
  const dualBookableAppointments = [];
  
  if (isDualBookable) {
    // Find all dual-bookable appointments that are already scheduled
    for (const appointment of scheduledAppointments) {
      const internalName = appointment.appointment_type_internal_name;
      const apptType = findAppointmentTypeByInternalName(internalName);
      
      if (apptType && apptType.dualBookable) {
        const start = new Date(appointment.start_date_time);
        const end = new Date(appointment.end_date_time);
        dualBookableAppointments.push({ start, end, internalName });
        
        // Add existing dual-bookable appointment times as candidate slots
        // This ensures we consider these slots as available for another dual booking
        if (end.getTime() - start.getTime() === appointmentDuration * 60 * 1000) {
          // Only add if the duration matches our appointment type's duration
          const slot = new ActualAvailableTimeSlot(
            new Date(start),
            new Date(end),
            true // Mark as already having a dual booking
          );
          candidateTimeSlots.push(slot);
        }
      }
    }
  }
  
  // For each candidate time slot, determine if it's available
  const finalTimeSlots = [];
  
  for (const slot of candidateTimeSlots) {
    let isAvailable = true;
    let hasDualBooking = false;
    
    // 1. Check for overlap with existing appointments (for non-dual bookable types)
    if (!isDualBookable) {
      for (const appointment of workAppointments) {
        const apptStart = new Date(appointment.start_date_time);
        const apptEnd = new Date(appointment.end_date_time);
        
        if (slot.overlaps(apptStart, apptEnd)) {
          isAvailable = false;
          break;
        }
      }
    } else {
      // For dual-bookable, we can have one other dual booking in the same slot
      let overlappingDualBookings = 0;
      
      // Check against all appointments to find both dual-bookable ones and regular ones
      for (const appointment of workAppointments) {
        const apptStart = new Date(appointment.start_date_time);
        const apptEnd = new Date(appointment.end_date_time);
        
        if (slot.overlaps(apptStart, apptEnd)) {
          // Check if this is a dual-bookable appointment
          const internalName = appointment.appointment_type_internal_name;
          const apptType = findAppointmentTypeByInternalName(internalName);
          
          if (apptType && apptType.dualBookable) {
            // For an exact match with a dual-bookable appointment, this is a valid dual booking opportunity
            if (apptStart.getTime() === slot.startTime.getTime() && apptEnd.getTime() === slot.endTime.getTime()) {
              overlappingDualBookings++;
              // If more than one dual booking already exists, this slot is not available
              if (overlappingDualBookings > 1) {
                isAvailable = false;
                break;
              }
              hasDualBooking = true;
            } else if (slot.overlaps(apptStart, apptEnd)) {
              // If there's any overlap but not an exact match, this won't work
              isAvailable = false;
              break;
            }
          } else {
            // This is a regular appointment, slot is not available
            isAvailable = false;
            break;
          }
        }
      }
    }
    
    // 2. Check if this slot would cause more than 60 minutes of continuous work
    if (isAvailable) {
      // Create a temporary "appointment" for this time slot
      const tempAppointment = {
        start_date_time: new Date(slot.startTime),
        end_date_time: new Date(slot.endTime)
      };
      
      // Check if this would create a continuous work block exceeding 60 minutes
      // Here we are removing time slots that would cause more than 60 minutes of work
      const allApptsForAnalysis = [...workAppointments, tempAppointment];
      
      // Sort them chronologically
      allApptsForAnalysis.sort((a, b) => {
        return a.start_date_time.getTime() - b.end_date_time.getTime();
      });
      
      // Find continuous work blocks
      const workBlocks = [];
      let currentBlock = [];
      
      for (let i = 0; i < allApptsForAnalysis.length; i++) {
        const current = allApptsForAnalysis[i];
        
        if (currentBlock.length === 0) {
          currentBlock.push(current);
        } else {
          const lastAppointment = currentBlock[currentBlock.length - 1];
          const lastEndTime = new Date(lastAppointment.end_date_time);
          const currentStartTime = new Date(current.start_date_time);
          
          // Consider appointments adjacent if they're within 1 minute of each other
          const timeDifference = (currentStartTime.getTime() - lastEndTime.getTime()) / (1000 * 60);
          
          if (timeDifference <= 1) {
            currentBlock.push(current);
          } else {
            if (currentBlock.length > 0) {
              workBlocks.push([...currentBlock]);
            }
            currentBlock = [current];
          }
        }
      }
      
      if (currentBlock.length > 0) {
        workBlocks.push(currentBlock);
      }
      
      // Check if any work block containing our temp appointment exceeds 60 minutes
      for (const block of workBlocks) {
        // Find if our temp appointment is in this block
        const hasOurAppointment = block.some(appt => 
          appt.start_date_time === tempAppointment.start_date_time && 
          appt.end_date_time === tempAppointment.end_date_time
        );
        
        if (hasOurAppointment) {
          // Calculate total duration of this block
          const blockStartTime = new Date(block[0].start_date_time);
          const blockEndTime = new Date(block[block.length - 1].end_date_time);
          const blockDurationMinutes = (blockEndTime.getTime() - blockStartTime.getTime()) / (1000 * 60);
          
          // If the block is 60+ minutes, this slot is not available
          if (blockDurationMinutes > 60) {
            isAvailable = false;
            break;
          }
        }
      }
    }
    
    // If the slot is available, add it to the final list
    if (isAvailable) {
      // Update the hasDualBooking property if needed
      slot.hasDualBooking = hasDualBooking;
      finalTimeSlots.push(slot);
    }
  }
  
  // Step 3: Create TimeSlot objects from the final list
  return finalTimeSlots.map(slot => slot.toTimeSlot(String(appointmentType.id)));
}

/**
 * Helper function to check if a time slot is available
 */
function isTimeSlotAvailable(startTime, appointmentType, availabilityResponse, appointmentsResponse) {
  const providerAvailabilities = availabilityResponse.userAvailabilities || [];
  const scheduledAppointments = appointmentsResponse.appointments || [];
  
  // Parse the start time - appointments are in UTC
  const startDate = new Date(startTime);
  const dayOfWeek = startDate.getDay();
  const hours = startDate.getHours();
  const minutes = startDate.getMinutes();
  
  // Only allow appointments at the top of the hour or 30 minutes past
  if (minutes !== 0 && minutes !== 30) {
    return false;
  }
  
  // Check if time is within provider's availability
  let isWithinAvailability = false;
  
  for (const providerAvailability of providerAvailabilities) {
    for (const typeAvailability of providerAvailability.availability_by_type || []) {
      // We check availability for the specific appointment type
      if (String(typeAvailability.appointment_type_id) === String(appointmentType.id)) {
        for (const window of typeAvailability.available_windows || []) {
          const windowStart = new Date(window.window_start); // Local time
          const windowEnd = new Date(window.window_end);     // Local time
          
          if (startDate >= windowStart && startDate < windowEnd) {
            // Calculate end time of the appointment
            const endDate = new Date(startDate);
            endDate.setMinutes(endDate.getMinutes() + appointmentType.duration);
            
            // Ensure the entire appointment fits within the availability window
            if (endDate <= windowEnd) {
              isWithinAvailability = true;
              break;
            }
          }
        }
      }
    }
    
    if (isWithinAvailability) break;
  }
  
  if (!isWithinAvailability) {
    return false;
  }
  
  // Check if this slot would cause the provider to work more than 90 consecutive minutes
  if (wouldExceedConsecutiveWork(startTime, appointmentType.duration, scheduledAppointments, 90)) {
    return false;
  }
  
  // Check if this slot would cause 60-90 minutes of consecutive work but has buffer available
  if (wouldCauseConsecutiveWork(startTime, appointmentType.duration, scheduledAppointments, 60, 90)) {
    // Check if buffer can be scheduled
    const bufferStartTime = calculateBufferStartTime(startTime, appointmentType.duration);
    if (!isBufferAvailable(bufferStartTime, availabilityResponse, appointmentsResponse)) {
      return false;
    }
  }
  
  // For non-dual bookable appointments, the slot must be completely free
  if (!appointmentType.dualBookable) {
    if (isTimeSlotOccupied(startTime, appointmentType.duration, scheduledAppointments)) {
      return false;
    }
  } else {
    // For dual bookable appointments, the slot can have one other dual bookable appointment
    const conflictingAppointments = getConflictingAppointments(
      startTime, 
      appointmentType.duration, 
      scheduledAppointments
    );
    
    if (conflictingAppointments.length > 0) {
      // Check if there's only one conflicting appointment and it's dual bookable
      if (conflictingAppointments.length === 1) {
        const conflictingInternalName = conflictingAppointments[0].appointment_type_internal_name;
        const conflictingType = findAppointmentTypeByInternalName(conflictingInternalName);
        
        if (!conflictingType || !conflictingType.dualBookable) {
          return false;
        }
      } else {
        // More than one conflicting appointment, slot not available
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Helper function to check if a buffer period is available in the provider's schedule
 * This function verifies that when we add a buffer appointment,
 * it can fit within the provider's availability window
 * 
 * @param {string} bufferStartTime - ISO datetime string for the buffer period start (in UTC)
 * @param {Object} availabilityResponse - Response from Cerbo API for provider availability
 * @param {Object} appointmentsResponse - Response from Cerbo API for provider's scheduled appointments
 * @returns {boolean} True if the buffer can be added, false otherwise
 */
function isBufferAvailable(bufferStartTime, availabilityResponse, appointmentsResponse) {
  const providerAvailabilities = availabilityResponse.userAvailabilities || [];
  const scheduledAppointments = appointmentsResponse.appointments || [];
  
  const bufferStart = new Date(bufferStartTime);
  const bufferEnd = new Date(bufferStartTime);
  bufferEnd.setMinutes(bufferEnd.getMinutes() + BUFFER_DURATION);
  
  // Check if buffer period is within provider's availability
  let isWithinAvailability = false;
  
  for (const providerAvailability of providerAvailabilities) {
    // For buffers, we need to check across all available windows of any appointment type
    // since buffer time can overlap with any type of available window
    for (const typeAvailability of providerAvailability.availability_by_type || []) {
      for (const window of typeAvailability.available_windows || []) {
        const windowStart = new Date(window.window_start); 
        const windowEnd = new Date(window.window_end);     
        
        if (bufferStart >= windowStart && bufferEnd <= windowEnd) {
          isWithinAvailability = true;
          break;
        }
      }
      
      if (isWithinAvailability) break;
    }
    
    if (isWithinAvailability) break;
  }
  
  if (!isWithinAvailability) {
    return false;
  }
  
  // Check if the buffer period overlaps with any existing appointments
  for (const appointment of scheduledAppointments) {
    const apptStart = new Date(appointment.start_date_time);
    const apptEnd = new Date(appointment.end_date_time);
    
    // Check for overlap
    if (
      (bufferStart <= apptEnd && bufferEnd >= apptStart) ||
      (apptStart <= bufferEnd && apptEnd >= bufferStart)
    ) {
      return false;
    }
  }
  
  return true;
}

/**
 * Helper function to calculate buffer start time
 */
function calculateBufferStartTime(startTime, duration) {
  const bufferStart = new Date(startTime);
  bufferStart.setMinutes(bufferStart.getMinutes() + duration);
  return bufferStart;
}

/**
 * Helper function to check if a time slot is occupied
 */
function isTimeSlotOccupied(startTime, duration, scheduledAppointments) {
  const appointmentStart = new Date(startTime);
  const appointmentEnd = new Date(startTime);
  appointmentEnd.setMinutes(appointmentEnd.getMinutes() + duration);
  
  // Check if this slot overlaps with any existing appointments
  for (const appointment of scheduledAppointments) {
    const apptStart = new Date(appointment.start_date_time);
    const apptEnd = new Date(appointment.end_date_time);
    
    // If there is any overlap, the slot is occupied
    if (
      (appointmentStart < apptEnd && appointmentEnd > apptStart)
    ) {
      return true;
    }
  }
  
  return false;
}

/**
 * Helper function to get conflicting appointments
 */
function getConflictingAppointments(startTime, duration, scheduledAppointments) {
  const appointmentStart = new Date(startTime);
  const appointmentEnd = new Date(startTime);
  appointmentEnd.setMinutes(appointmentEnd.getMinutes() + duration);
  
  return scheduledAppointments.filter(appointment => {
    const apptStart = new Date(appointment.start_date_time);
    const apptEnd = new Date(appointment.end_date_time);
    
    // If there is any overlap, this appointment conflicts
    return (appointmentStart < apptEnd && appointmentEnd > apptStart);
  });
}

/**
 * Calculate the end time of an appointment
 * 
 * @param {Date} startTime - ISO datetime string for the appointment start
 * @param {number} durationMinutes - Duration of the appointment in minutes
 * @returns {Date} ISO datetime string for the appointment end
 */
function calculateEndTime(startTime, durationMinutes) {
  const start = new Date(startTime);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMinutes);
  return end;
}

/**
 * Create a task in Cerbo for the appointment
 * 
 * @param {string} patientName - Patient name
 * @param {string} email - Patient email
 * @param {Object} appointmentType - Appointment type object
 * @param {string} startTime - Start time of the appointment (ISO string)
 * @param {string} providerId - Provider ID (not used - we use the hard-coded PROVIDER_ID)
 * @returns {Promise<Object>} Task creation result
 */
async function createTask(patientName, email, appointmentType, startTime, providerId) {
  // For task creation, we want to display the local time to the provider
  // startTime is in UTC, but we'll display it as if it were local time
  const localDate = new Date(startTime);
  
  // Format the date for display
  const formattedDate = localDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  // Format the time for display
  const formattedTime = localDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  
  // Create task description
  const taskDescription = `New ${appointmentType.displayName} appointment for ${patientName} (${email}) on ${formattedDate} at ${formattedTime}`;
  
  // Create task data object according to Cerbo API docs
  const taskData = {
    dr_id: Number(PROVIDER_ID), // Hard-coded provider ID
    subject: `${appointmentType.displayName} Appointment`,
    priority: "low", // Set priority to low as requested
    notes: taskDescription,
    due_date: localDate.toISOString(),
    remind_minutes_before: 60 // Reminder 1 hour before the task is due
    // We don't have pt_id here, so we won't include it
  };
  
  // Create task in Cerbo API
  try {
    // Send task creation request
    const taskResponse = await createCerboTask(taskData);
    
    logger.info(`Created task for appointment: ${taskDescription}`);
    return taskResponse;
  } catch (error) {
    logger.error("Error creating task:", error);
    throw error;
  }
}

/**
 * Helper function to check if a buffer is needed
 */
function checkIfBufferNeeded(startTime, duration, appointmentsResponse) {
  const scheduledAppointments = appointmentsResponse.appointments || [];
  return wouldCauseConsecutiveWork(startTime, duration, scheduledAppointments, 60, Infinity);
}

/**
 * Helper function to check if a buffer is needed
 */
function checkBufferAvailability(startTime, endTime, existingAppointments) {
  const appointmentStart = new Date(startTime);
  const appointmentEnd = new Date(endTime);
  
  // Find the earliest and latest consecutive appointments
  let earliestConsecutiveStart = appointmentStart;
  let latestConsecutiveEnd = appointmentEnd;
  
  // Check appointments before this one
  for (const appointment of existingAppointments) {
    const apptStart = new Date(appointment.start_date_time);
    const apptEnd = new Date(appointment.end_date_time);
    
    // If the appointment ends exactly when our new one starts or starts exactly when our new one ends
    // (or there is any overlap), they are consecutive
    if (
      (apptEnd.getTime() === appointmentStart.getTime() || 
       appointmentEnd.getTime() === apptStart.getTime() || 
       (apptEnd > appointmentStart && apptStart < appointmentEnd))
    ) {
      if (apptStart < earliestConsecutiveStart) {
        earliestConsecutiveStart = apptStart;
      }
      
      if (apptEnd > latestConsecutiveEnd) {
        latestConsecutiveEnd = apptEnd;
      }
    }
  }
  
  // Calculate total minutes of consecutive work
  const totalConsecutiveMinutes = 
    (latestConsecutiveEnd.getTime() - earliestConsecutiveStart.getTime()) / (1000 * 60);
  
  return totalConsecutiveMinutes > 90;
}

/**
 * Helper function to check if a time slot would cause provider to work more than maxMinutes consecutively
 * 
 * @param {string} startTime - Start time of the appointment
 * @param {number} duration - Duration of the appointment in minutes
 * @param {Array} scheduledAppointments - List of scheduled appointments
 * @param {number} maxMinutes - Maximum consecutive minutes allowed
 * @returns {boolean} True if the appointment would exceed max consecutive work time
 */
function wouldExceedConsecutiveWork(startTime, duration, scheduledAppointments, maxMinutes) {
  // Create the new appointment object
  const newAppointment = {
    start_date_time: startTime,
    end_date_time: calculateEndTime(startTime, duration),
    appointment_type_id: null // We don't know the type yet, but it's not in the ignore list
  };
  
  // Get the list of appointment types to ignore
  const typesToIgnore = getAppointmentTypesToIgnore();
  
  // Filter out appointments with types that should be ignored
  const workAppointments = scheduledAppointments.filter(appointment => {
    // Check if the appointment has an internal name that corresponds to a type we should ignore
    if (appointment.appointment_type_internal_name) {
      const typeId = getAppointmentTypeIdFromInternalName(appointment.appointment_type_internal_name);
      if (typeId && typesToIgnore.includes(typeId)) {
        return false;
      }
    }
    return true;
  });
  
  // Add the new appointment to the list
  const allAppointments = [...workAppointments, newAppointment];
  
  // Sort all appointments chronologically by start time
  allAppointments.sort((a, b) => {
    return a.start_date_time.getTime() - b.start_date_time.getTime();
  });
  
  // Find continuous work blocks
  const workBlocks = [];
  let currentBlock = [];
  
  for (let i = 0; i < allAppointments.length; i++) {
    const current = allAppointments[i];
    
    if (currentBlock.length === 0) {
      // Start a new block
      currentBlock.push(current);
    } else {
      const lastAppointment = currentBlock[currentBlock.length - 1];
      const lastEndTime = new Date(lastAppointment.end_date_time);
      const currentStartTime = new Date(current.start_date_time);
      
      // Consider appointments adjacent if they're within 1 minute of each other
      const timeDifference = (currentStartTime.getTime() - lastEndTime.getTime()) / (1000 * 60); // in minutes
      
      if (timeDifference <= 1) {
        // This appointment is part of the current block
        currentBlock.push(current);
      } else {
        // This appointment starts a new block
        if (currentBlock.length > 0) {
          workBlocks.push([...currentBlock]);
        }
        currentBlock = [current];
      }
    }
  }
  
  // Add the last block if it's not empty
  if (currentBlock.length > 0) {
    workBlocks.push(currentBlock);
  }
  
  // Check each work block for exceeding the maximum consecutive minutes
  for (const block of workBlocks) {
    if (block.length > 0) {
      const blockStartTime = new Date(block[0].start_date_time);
      const blockEndTime = new Date(block[block.length - 1].end_date_time);
      const blockDurationMinutes = (blockEndTime.getTime() - blockStartTime.getTime()) / (1000 * 60);
      
      if (blockDurationMinutes > maxMinutes) {
        return true; // This block exceeds the maximum consecutive work time
      }
    }
  }
  
  return false; // No blocks exceed the maximum consecutive work time
}

/**
 * Helper function to check if a time slot would cause consecutive work in a specific range
 * 
 * @param {Date} startTime - Start time of the appointment
 * @param {number} duration - Duration of the appointment in minutes
 * @param {Array} scheduledAppointments - List of scheduled appointments
 * @param {number} minMinutes - Minimum consecutive minutes threshold
 * @param {number} maxMinutes - Maximum consecutive minutes threshold
 * @returns {boolean} True if the appointment would cause consecutive work within the specified range
 */
function wouldCauseConsecutiveWork(startTime, duration, scheduledAppointments, minMinutes, maxMinutes) {
  // Create the new appointment object
  const newAppointment = {
    start_date_time: startTime,
    end_date_time: calculateEndTime(startTime, duration),
    appointment_type_id: null // We don't know the type yet, but it's not in the ignore list
  };
  
  // Get the list of appointment types to ignore
  const typesToIgnore = getAppointmentTypesToIgnore();
  
  // Filter out appointments with types that should be ignored
  const workAppointments = scheduledAppointments.filter(appointment => {
    // Check if the appointment has an internal name that corresponds to a type we should ignore
    if (appointment.appointment_type_internal_name) {
      const typeId = getAppointmentTypeIdFromInternalName(appointment.appointment_type_internal_name);
      if (typeId && typesToIgnore.includes(typeId)) {
        return false;
      }
    }
    return true;
  });
  
  // Add the new appointment to the list
  const allAppointments = [...workAppointments, newAppointment];
  
  // Sort all appointments chronologically by start time
  allAppointments.sort((a, b) => {
    return a.start_date_time.getTime() - b.start_date_time.getTime();
  });
  
  // Find continuous work blocks
  const workBlocks = [];
  let currentBlock = [];
  
  for (let i = 0; i < allAppointments.length; i++) {
    const current = allAppointments[i];
    
    if (currentBlock.length === 0) {
      // Start a new block
      currentBlock.push(current);
    } else {
      const lastAppointment = currentBlock[currentBlock.length - 1];
      const lastEndTime = new Date(lastAppointment.end_date_time);
      const currentStartTime = new Date(current.start_date_time);
      
      // Check if there's overlap or if the appointments are adjacent
      // Consider appointments adjacent if they're within 1 minute of each other
      const timeDifference = (currentStartTime.getTime() - lastEndTime.getTime()) / (1000 * 60); // in minutes
      
      if (timeDifference <= 1) {
        // This appointment is part of the current block
        currentBlock.push(current);
      } else {
        // This appointment starts a new block
        if (currentBlock.length > 0) {
          workBlocks.push([...currentBlock]);
        }
        currentBlock = [current];
      }
    }
  }
  
  // Add the last block if it's not empty
  if (currentBlock.length > 0) {
    workBlocks.push(currentBlock);
  }
  
  // Check each work block for being within the specified range
  for (const block of workBlocks) {
    if (block.length > 0) {
      const blockStartTime = new Date(block[0].start_date_time);
      const blockEndTime = new Date(block[block.length - 1].end_date_time);
      const blockDurationMinutes = (blockEndTime.getTime() - blockStartTime.getTime()) / (1000 * 60);
      
      if (blockDurationMinutes >= minMinutes && blockDurationMinutes <= maxMinutes) {
        return true; // This block is within the specified range
      }
    }
  }
  
  return false; // No blocks are within the specified range
}

/**
 * Returns a list of appointment type IDs that should be ignored when calculating consecutive work
 * This allows us to easily modify which types are excluded from work calculations in the future
 * 
 * @returns {Array<string>} List of appointment type IDs to ignore
 */
function getAppointmentTypesToIgnore() {
  // Currently only ADMIN-FLEXIBLE appointments should be ignored
  return [String(ADMIN_FLEXIBLE_TYPE_ID)];
}

/**
 * Helper function to find an appointment type by its internal name
 * 
 * @param {string} internalName - The internal name to search for
 * @returns {PhysioSpaAppointmentType|undefined} The matching appointment type or undefined
 */
function findAppointmentTypeByInternalName(internalName) {
  return appointmentTypes.find(type => type.internalName === internalName);
}

/**
 * Helper function to get the ID of an appointment type from its internal name
 * 
 * @param {string} internalName - The internal name to look up
 * @returns {string|undefined} The ID of the appointment type, or undefined if not found
 */
function getAppointmentTypeIdFromInternalName(internalName) {
  const type = findAppointmentTypeByInternalName(internalName);
  return type ? String(type.id) : undefined;
}

// Request model for creating appointments
class AppointmentRequest {
  constructor(patientName, email, providerId, appointmentTypeId, startTime, duration) {
    this.patientName = patientName;
    this.email = email;
    this.providerId = parseInt(String(providerId));
    this.appointmentTypeId = parseInt(String(appointmentTypeId));
    this.startTime = startTime;
    this.duration = duration;
    
    const appointmentType = appointmentTypes.find(type => 
      String(type.id) === String(this.appointmentTypeId)
    );
    this.appointmentTypeName = appointmentType ? appointmentType.internalName : '';
  }

  toJson() {
    const endTime = calculateEndTime(this.startTime.toISOString(), this.duration);
    const title = `${this.patientName} (${this.email})`;
    
    return {
      start_date_time: this.startTime.toISOString(),
      end_date_time: endTime,
      provider_ids: [this.providerId],
      appointment_type: this.appointmentTypeName,
      title: title,
      appointment_note: title,
      status: "scheduled",
      telemedicine: false
    };
  }
}

// Export internal helper functions for testing
export {
  calculateAvailableTimeSlots,
  isTimeSlotAvailable,
  isBufferAvailable,
  calculateBufferStartTime,
  isTimeSlotOccupied,
  getConflictingAppointments,
  calculateEndTime,
  createTask,
  checkIfBufferNeeded,
  checkBufferAvailability,
  wouldExceedConsecutiveWork,
  wouldCauseConsecutiveWork,
  getAppointmentTypesToIgnore,
  findAppointmentTypeByInternalName,
  getAppointmentTypeIdFromInternalName,
  PhysioSpaAppointmentType,  // Export the classes
  ActualAvailableTimeSlot
};
