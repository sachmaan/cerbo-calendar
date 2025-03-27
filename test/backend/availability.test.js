import { jest, beforeAll, describe, test, expect } from '@jest/globals';
import { 
  calculateAvailableTimeSlots, 
  PhysioSpaAppointmentType, 
  ActualAvailableTimeSlot 
} from '../../backend/availability.web.js';
import { AvailabilityResponse, AppointmentsResponse } from '../../cerbo_api.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path for the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock specific helper functions from the module
jest.mock('../../backend/availability.web.js', () => {
  const originalModule = jest.requireActual('../../backend/availability.web.js');
  
  return {
    ...originalModule,
    getAppointmentTypesToIgnore: jest.fn().mockReturnValue([]),
    findAppointmentTypeByInternalName: jest.fn().mockReturnValue(null),
    getAppointmentTypeIdFromInternalName: jest.fn().mockReturnValue(null)
  };
});

// Make classes globally available if needed by the module
global.ActualAvailableTimeSlot = ActualAvailableTimeSlot;
global.PhysioSpaAppointmentType = PhysioSpaAppointmentType;

describe('Cerbo API Response Parsing', () => {
  // Load the test data from JSON files
  const availabilityJsonPath = path.join(__dirname, 'availability_response.json');
  const appointmentsJsonPath = path.join(__dirname, 'appointments_response.json');
  
  const availabilityJson = JSON.parse(fs.readFileSync(availabilityJsonPath, 'utf8'));
  const appointmentsJson = JSON.parse(fs.readFileSync(appointmentsJsonPath, 'utf8'));
  
  test('should correctly parse availability and appointments JSON responses', () => {
    // Parse the availability response
    const availabilityResponse = AvailabilityResponse.fromJson(availabilityJson);
    
    // Validate availability response structure
    expect(availabilityResponse).toHaveProperty('userAvailabilities');
    expect(Array.isArray(availabilityResponse.userAvailabilities)).toBe(true);
    
    // Check specific properties from the test data
    const firstProvider = availabilityResponse.userAvailabilities[0];
    expect(firstProvider).toHaveProperty('provider_id', 61);
    expect(firstProvider).toHaveProperty('provider_details');
    expect(firstProvider.provider_details).toHaveProperty('first_name', 'Sachin');
    expect(firstProvider.provider_details).toHaveProperty('last_name', 'Nene');
    
    // Validate availability_by_type structure
    expect(firstProvider).toHaveProperty('availability_by_type');
    expect(Array.isArray(firstProvider.availability_by_type)).toBe(true);
    
    // Check that at least one appointment type exists
    expect(firstProvider.availability_by_type.length).toBeGreaterThan(0);
    
    // Validate first appointment type
    const firstAppointmentType = firstProvider.availability_by_type[0];
    expect(firstAppointmentType).toHaveProperty('appointment_type_id');
    expect(firstAppointmentType).toHaveProperty('available_windows');
    
    // Validate that window_start and window_end are Date objects
    const firstWindow = firstAppointmentType.available_windows[0];
    expect(firstWindow).toHaveProperty('window_start');
    expect(firstWindow).toHaveProperty('window_end');
    expect(firstWindow.window_start instanceof Date).toBe(true);
    expect(firstWindow.window_end instanceof Date).toBe(true);
    
    // Parse the appointments response
    const appointmentsResponse = AppointmentsResponse.fromJson(appointmentsJson);
    
    // Validate appointments response structure
    expect(appointmentsResponse).toHaveProperty('appointments');
    expect(Array.isArray(appointmentsResponse.appointments)).toBe(true);
    
    // Check that appointments were parsed
    expect(appointmentsResponse.appointments.length).toBeGreaterThan(0);
    expect(appointmentsResponse.appointments.length).toBe(16); // Verify we have 16 appointments
    
    // Validate first appointment
    const firstAppointment = appointmentsResponse.appointments[0];
    expect(firstAppointment).toHaveProperty('id', 130562);
    expect(firstAppointment).toHaveProperty('title', 'Sachin Nene Test 5 (5@example.com)');
    expect(firstAppointment).toHaveProperty('start_date_time');
    expect(firstAppointment).toHaveProperty('end_date_time');
    
    // Validate that start_date_time and end_date_time are Date objects
    expect(firstAppointment.start_date_time instanceof Date).toBe(true);
    expect(firstAppointment.end_date_time instanceof Date).toBe(true);
    
    // Validate appointment_type_internal_name was set from appointment_type
    expect(firstAppointment).toHaveProperty('appointment_type_internal_name', 'Acupuncture.Follow-up, self-schd (50 min)');
  });
});

describe('calculateAvailableTimeSlots with real data', () => {
  // Helper function to load and parse the test data
  const loadTestData = () => {
    const availabilityJsonPath = path.join(__dirname, 'availability_response.json');
    const appointmentsJsonPath = path.join(__dirname, 'appointments_response.json');
    
    const availabilityJson = JSON.parse(fs.readFileSync(availabilityJsonPath, 'utf8'));
    const appointmentsJson = JSON.parse(fs.readFileSync(appointmentsJsonPath, 'utf8'));
    
    // Parse the responses using the actual parsers
    const availabilityResponse = AvailabilityResponse.fromJson(availabilityJson);
    const appointmentsResponse = AppointmentsResponse.fromJson(appointmentsJson);
    
    return { availabilityResponse, appointmentsResponse };
  };
  
  // Helper function to format time slots for assertion
  const formatTimeSlots = (slots) => {
    return slots.map(slot => {
      const startTime = new Date(slot.startTime);
      return startTime.toISOString();
    });
  };
  
  test('get time slots for acupuncture appointment', () => {
    const { availabilityResponse, appointmentsResponse } = loadTestData();
    
    // Create a test appointment type for Acupuncture Follow-up
    const testAppointmentType = new PhysioSpaAppointmentType(
      151, // Using actual ID from the data
      'Acupuncture.Follow-up',
      'Acupuncture.Follow-up, self-schd (50 min)',
      50, // 50 minute duration per the type name
      false // not dual bookable
    );
    
    // Call the function we're testing with the parsed data
    const result = calculateAvailableTimeSlots(
      availabilityResponse,
      appointmentsResponse,
      testAppointmentType
    );
    
    // Basic validation of the results
    expect(result).toBeInstanceOf(Array);
    
    // Expect some time slots to be generated
    expect(result.length).toBeGreaterThan(0);
    
    // Count the number of time slots
    console.log(`Number of available time slots for Acupuncture: ${result.length}`);
    
    // Log the exact start times for each slot
    const formattedTimeSlots = formatTimeSlots(result);
    console.log('Available time slots for Acupuncture:', formattedTimeSlots);
    
    // Assert the exact number of time slots
    expect(result.length).toBe(19);
    
    // Assert all the expected time slots
    const expectedTimeSlots = [
      '2025-03-28T17:30:00.000Z',
      '2025-03-28T18:00:00.000Z',
      '2025-03-28T18:30:00.000Z',
      '2025-03-28T19:00:00.000Z',
      '2025-03-29T12:00:00.000Z',
      '2025-03-29T12:30:00.000Z',
      '2025-03-29T13:00:00.000Z',
      '2025-03-29T13:30:00.000Z',
      '2025-03-29T14:00:00.000Z',
      '2025-03-29T14:30:00.000Z',
      '2025-03-29T15:00:00.000Z',
      '2025-03-29T15:30:00.000Z',
      '2025-03-29T16:00:00.000Z',
      '2025-03-29T16:30:00.000Z',
      '2025-03-29T17:00:00.000Z',
      '2025-03-29T17:30:00.000Z',
      '2025-03-29T18:00:00.000Z',
      '2025-03-29T18:30:00.000Z',
      '2025-03-29T19:00:00.000Z'
    ];
    
    // Check that all slots match the expected start times
    for (let i = 0; i < result.length; i++) {
      const startTimeISO = new Date(result[i].startTime).toISOString();
      expect(startTimeISO).toBe(expectedTimeSlots[i]);
    }
    
    // Verify each time slot has the expected properties and duration
    result.forEach(slot => {
      expect(slot).toHaveProperty('startTime');
      expect(slot).toHaveProperty('endTime');
      expect(slot).toHaveProperty('appointmentTypeId');
      // Check that the appointmentTypeId is either 151 as a number or "151" as a string
      expect(['151', 151].includes(slot.appointmentTypeId)).toBe(true);
      
      const start = new Date(slot.startTime);
      const end = new Date(slot.endTime);
      const diffMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      expect(diffMinutes).toBe(50); // 50 minute duration
    });
    
    // If there are appointments in the test data, verify that no slots overlap with them
    if (appointmentsResponse.appointments.length > 0) {
      appointmentsResponse.appointments.forEach(appointment => {
        const apptStart = appointment.start_date_time;
        const apptEnd = appointment.end_date_time;
        
        // Check that no slot overlaps with this appointment
        result.forEach(slot => {
          const slotStart = new Date(slot.startTime);
          const slotEnd = new Date(slot.endTime);
          
          // If the slot starts during the appointment
          const slotStartsDuringAppt = 
            slotStart >= apptStart && slotStart < apptEnd;
          
          // If the slot ends during the appointment
          const slotEndsDuringAppt = 
            slotEnd > apptStart && slotEnd <= apptEnd;
          
          // If the slot completely contains the appointment
          const slotContainsAppt = 
            slotStart <= apptStart && slotEnd >= apptEnd;
          
          // No overlap should occur
          expect(slotStartsDuringAppt || slotEndsDuringAppt || slotContainsAppt).toBe(false);
        });
      });
    }
  });
  
  test('get time slots for vagus nerve stem therapy', () => {
    const { availabilityResponse, appointmentsResponse } = loadTestData();
    
    // Create a test appointment type for Vagus Nerve Stem Therapy Initial
    const testAppointmentType = new PhysioSpaAppointmentType(
      144, // Using actual ID from the data
      'Vagus Nerve Stem Therapy- Initial',
      'Vagus Nerve Stem Therapy- Initial',
      30, // 30 minute duration per the type details
      true // dual bookable
    );
    
    // Call the function we're testing with the parsed data
    const result = calculateAvailableTimeSlots(
      availabilityResponse,
      appointmentsResponse,
      testAppointmentType
    );
    
    // Basic validation of the results
    expect(result).toBeInstanceOf(Array);
    
    // Expect some time slots to be generated
    expect(result.length).toBeGreaterThan(0);
    
    // Count the number of time slots
    console.log(`Number of available time slots for Vagus Nerve Stem Therapy: ${result.length}`);
    
    // Log the exact start times for each slot
    const formattedTimeSlots = formatTimeSlots(result);
    console.log('Available time slots for Vagus Nerve Stem Therapy:', formattedTimeSlots);
    
    // Assert the exact number of time slots
    expect(result.length).toBe(25);
    
    // Assert all the expected time slots
    const expectedTimeSlots = [
      '2025-03-27T18:00:00.000Z',
      '2025-03-27T19:30:00.000Z',
      '2025-03-28T17:30:00.000Z',
      '2025-03-28T18:00:00.000Z',
      '2025-03-28T18:30:00.000Z',
      '2025-03-28T19:00:00.000Z',
      '2025-03-28T19:30:00.000Z',
      '2025-03-29T12:00:00.000Z',
      '2025-03-29T12:30:00.000Z',
      '2025-03-29T13:00:00.000Z',
      '2025-03-29T13:30:00.000Z',
      '2025-03-29T14:00:00.000Z',
      '2025-03-29T14:30:00.000Z',
      '2025-03-29T15:00:00.000Z',
      '2025-03-29T15:30:00.000Z',
      '2025-03-29T16:00:00.000Z',
      '2025-03-29T16:30:00.000Z',
      '2025-03-29T17:00:00.000Z',
      '2025-03-29T17:30:00.000Z',
      '2025-03-29T18:00:00.000Z',
      '2025-03-29T18:30:00.000Z',
      '2025-03-29T19:00:00.000Z',
      '2025-03-29T19:30:00.000Z',
      '2025-03-27T18:30:00.000Z',
      '2025-03-28T15:00:00.000Z'
    ];
    
    // Check that all slots match the expected start times
    for (let i = 0; i < result.length; i++) {
      const startTimeISO = new Date(result[i].startTime).toISOString();
      expect(startTimeISO).toBe(expectedTimeSlots[i]);
    }
    
    // Verify each time slot has the expected properties and duration
    result.forEach(slot => {
      expect(slot).toHaveProperty('startTime');
      expect(slot).toHaveProperty('endTime');
      expect(slot).toHaveProperty('appointmentTypeId');
      // Check that the appointmentTypeId is either 144 as a number or "144" as a string
      expect(['144', 144].includes(slot.appointmentTypeId)).toBe(true);
      
      const start = new Date(slot.startTime);
      const end = new Date(slot.endTime);
      const diffMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
      expect(diffMinutes).toBe(30); // 30 minute duration
    });
    
    // If there are appointments in the test data, verify that no slots overlap with them
    if (appointmentsResponse.appointments.length > 0) {
      appointmentsResponse.appointments.forEach(appointment => {
        const apptStart = appointment.start_date_time;
        const apptEnd = appointment.end_date_time;
        
        // Skip this check for Vagus Nerve Stem Therapy since it's dual bookable
        if (testAppointmentType.displayName !== 'Vagus Nerve Stem Therapy- Initial') {
          result.forEach(slot => {
            const slotStart = slot.startTime;
            const slotEnd = slot.endTime;
            
            // Check for various overlap conditions
            const slotStartsDuringAppt = slotStart >= apptStart && slotStart < apptEnd;
            const slotEndsDuringAppt = slotEnd > apptStart && slotEnd <= apptEnd;
            const slotContainsAppt = slotStart <= apptStart && slotEnd >= apptEnd;
            
            // No overlap should occur
            expect(slotStartsDuringAppt || slotEndsDuringAppt || slotContainsAppt).toBe(false);
          });
        }
      });
    }
  });
});
