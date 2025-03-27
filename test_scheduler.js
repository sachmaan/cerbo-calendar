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
function getNextTwoWeeks() {
  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  
  const twoWeeksLater = new Date(today);
  twoWeeksLater.setDate(today.getDate() + 14);
  const endDate = twoWeeksLater.toISOString().split('T')[0];
  
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
    const { startDate, endDate } = getNextTwoWeeks();
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

    // Display available time slots in 3 columns
    console.log('\nAvailable time slots:');
    const columnWidth = 35;
    const numSlots = availableSlots.length;
    const rowsNeeded = Math.ceil(numSlots / 3);

    for (let row = 0; row < rowsNeeded; row++) {
      const rowOutput = [];
      for (let col = 0; col < 3; col++) {
        const index = row + (col * rowsNeeded);
        if (index < numSlots) {
          const slot = availableSlots[index];
          const timeStr = formatDateForDisplay(slot.startTime);
          rowOutput.push(`${(index + 1).toString().padStart(2)}. ${timeStr}`.padEnd(columnWidth));
        } else {
          rowOutput.push(''.padEnd(columnWidth));
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
    console.log(`\nSelected time slot: ${formatDateForDisplay(selectedSlot.startTime)}`);

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
      selectedSlot.startTime,
      selectedType.id
    );

    // Display booking result
    if (bookingResponse.success) {
      console.log('\nAppointment booked successfully!');
      console.log(`Appointment details:`);
      console.log(`- Patient: ${patientName}`);
      console.log(`- Email: ${patientEmail}`);
      console.log(`- Time: ${formatDateForDisplay(selectedSlot.startTime)}`);
      console.log(`- Type: ${selectedType.displayName}`);
      
      if (bookingResponse.message) {
        console.log(`\nMessage from server: ${bookingResponse.message}`);
      }
    } else {
      console.error('\nFailed to book appointment:', bookingResponse.error);
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
