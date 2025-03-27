// test_scheduler.js
import { getAvailability as getCerboAvailability, getAllAppointments, createAppointment } from './cerbo_api.js';
import { getAppointmentTypes, getAvailability as getAvailabilitySlots, bookAppointment } from './backend/availability.web.js';
import readline from 'readline';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to ask a question and get user input
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Helper function to format dates for display
/**
 * Format a date string for display
 * @param {string} dateString - ISO date string to format
 * @returns {string} Formatted date string
 */
function formatDateForDisplay(dateString) {
  const date = new Date(dateString);
  /** @type {Intl.DateTimeFormatOptions} */
  const options = { 
    weekday: 'long',
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  
  return date.toLocaleString('en-US', options);
}

// Function to get the next two weeks date range
function getNextTwoDays() {
  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  
  const twoDaysLater = new Date(today);
  twoDaysLater.setDate(today.getDate() + 2);
  const endDate = twoDaysLater.toISOString().split('T')[0];
  
  return { startDate, endDate };
}

async function main() {
  try {
    console.log('PhysioSpa Scheduling System Test\n');
    console.log('================================\n');

    // Use Case 1: Get available appointment types
    console.log('Fetching available appointment types...\n');
    const appointmentTypesResponse = await getAppointmentTypes();
    
    if (!appointmentTypesResponse.success) {
      console.error('Error fetching appointment types:', appointmentTypesResponse.error);
      return;
    }

    // Display available appointment types
    const appointmentTypes = appointmentTypesResponse.appointmentTypes;
    console.log('Available appointment types:');
    appointmentTypes.forEach((type, index) => {
      console.log(`${index + 1}. ${type.displayName} (ID: ${type.id})`);
    });

    // Get user's appointment type selection
    const typeSelection = parseInt(await askQuestion('\nSelect an appointment type (enter number): ')) - 1;
    if (typeSelection < 0 || typeSelection >= appointmentTypes.length) {
      console.log('Invalid selection');
      return;
    }

    const selectedType = appointmentTypes[typeSelection];
    console.log(`\nSelected: ${selectedType.displayName} (ID: ${selectedType.id})`);

    // Get date range for availability check
    const { startDate, endDate } = getNextTwoDays();
    console.log('\nChecking availability from', startDate, 'to', endDate);

    // Use Case 2: Get availability for selected appointment type
    console.log('\nFetching availability...\n');
    const availabilityResponse = await getAvailabilitySlots(selectedType.id, startDate, endDate);
    
    if (!availabilityResponse.success) {
      console.error('Error fetching availability:', availabilityResponse.error);
      return;
    }

    const availableSlots = availabilityResponse.availableSlots;
    
    if (availableSlots.length === 0) {
      console.log('No available time slots found for the selected date range.');
      return;
    }

    // Display available time slots
    console.log(`Found ${availableSlots.length} available time slot(s):`);
    
    // Create a table for displaying available slots
    const slotsPerRow = 3;
    const rows = Math.ceil(availableSlots.length / slotsPerRow);
    
    for (let i = 0; i < rows; i++) {
      const rowOutput = [];
      for (let j = 0; j < slotsPerRow; j++) {
        const slotIndex = i * slotsPerRow + j;
        if (slotIndex < availableSlots.length) {
          const slot = availableSlots[slotIndex];
          const hasBuffer = slot.buffer !== null;
          
          // Format slot info with primary booking appointment type
          rowOutput.push(`${slotIndex + 1}. ${formatDateForDisplay(slot.startTime)}${hasBuffer ? ' [+buffer]' : ''}`.padEnd(30));
        } else {
          rowOutput.push(''.padEnd(30));
        }
      }
      console.log(rowOutput.join(''));
    }

    // Get user's time slot selection
    const slotSelection = parseInt(await askQuestion('\nSelect a time slot (enter number): ')) - 1;
    if (slotSelection < 0 || slotSelection >= availableSlots.length) {
      console.log('Invalid selection');
      return;
    }

    const selectedSlot = availableSlots[slotSelection];
    console.log(`\nSelected slot: ${formatDateForDisplay(selectedSlot.startTime)} - ${formatDateForDisplay(selectedSlot.endTime)}`);
    
    // Display buffer information if present
    if (selectedSlot.buffer) {
      console.log('This booking includes a buffer appointment');
    }

    // Get user details for booking
    const patientName = await askQuestion('\nEnter patient name: ');
    if (!patientName.trim()) {
      console.log('Invalid name');
      return;
    }

    const patientEmail = await askQuestion('Enter patient email: ');
    if (!patientEmail.trim() || !patientEmail.includes('@')) {
      console.log('Invalid email');
      return;
    }

    // Use Case 3: Book the appointment
    console.log('\nBooking appointment...');
    const bookingResponse = await bookAppointment(
      patientName,
      patientEmail,
      selectedSlot
    );

    // Display booking result
    if (bookingResponse.success) {
      console.log('\nAppointment booked successfully!');
      console.log(`Appointment details:`);
      console.log(`- Patient: ${bookingResponse.appointment.patientName}`);
      console.log(`- Email: ${bookingResponse.appointment.email}`);
      console.log(`- Date: ${formatDateForDisplay(bookingResponse.appointment.startTime)} - ${formatDateForDisplay(bookingResponse.appointment.endTime)}`);
      console.log(`- Type: ${selectedType.displayName}`);
      
      if (bookingResponse.bookingResults && bookingResponse.bookingResults.length > 1) {
        console.log('\nAdditional bookings:');
        bookingResponse.bookingResults.forEach((result, index) => {
          if (result.isBuffer) {
            console.log(`- Buffer appointment: ${formatDateForDisplay(result.startTime)} - ${formatDateForDisplay(result.endTime)}`);
          }
        });
      }
    } else {
      console.log('\nFailed to book appointment:', bookingResponse.error);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Close readline interface
    rl.close();
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  rl.close();
});
