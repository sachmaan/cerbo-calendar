# PhysioSpa Scheduling System

A Node.js application that interfaces with the Cerbo API to handle appointment scheduling for PhysioSpa, implementing specific business rules for availability and booking.

## Features

- Retrieve available appointment types
- Find available time slots based on business rules
- Book appointments with proper buffer times
- Create tasks for each booking
- Support for dual bookable appointments

## Business Rules

- Only allows appointments at the top of the hour or 30 minutes past
- Prevents bookings that would make the provider work more than 90 consecutive minutes
- Adds buffer time when a provider would work 60+ consecutive minutes
- Supports dual bookable appointments

## Project Structure

- **api_token.js** - Authentication credentials for Cerbo API
- **cerbo_api.js** - API functions to interact with Cerbo
- **backend/availability.web.js** - Main business logic
- **mock_data.js** - Mock data for testing
- **test_scheduler.js** - CLI test script for the scheduling system
- **test_scheduler_mock.js** - CLI test script using mock data

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with your Cerbo API credentials:
   ```
   CERBO_API_BASE_URL=https://your-cerbo-instance.md-hq.com/api/v1
   CERBO_API_AUTH_HEADER=Basic your_base64_encoded_credentials
   ```
   (See `.env.example` for a template)

## Usage

### Testing with the CLI

Run the test script to interact with the scheduling system:

```
node test_scheduler.js
```

This will guide you through:
1. Selecting an appointment type
2. Viewing available time slots
3. Booking an appointment

### Integration with Web Applications

The system can be integrated with web applications using the functions in `backend/availability.web.js`:

```javascript
import { getAppointmentTypes, getAvailability, bookAppointment } from './backend/availability.web.js';

// Get available appointment types
const appointmentTypes = await getAppointmentTypes();

// Get available time slots
const availability = await getAvailability(appointmentTypeId, startDate, endDate);

// Book an appointment
const booking = await bookAppointment(appointmentTypeId, startDateTime, patientInfo);
```

## API Integration

The system integrates with the Cerbo API using the following endpoints:

- `/appointments/availability` - Get provider availability
- `/appointments` - Get and create appointments
- `/tasks` - Create tasks

API credentials are stored in environment variables for security.

## Development

### Environment Variables

- `CERBO_API_BASE_URL` - Base URL for the Cerbo API
- `CERBO_API_AUTH_HEADER` - Authentication header for API requests

### Testing with Mock Data

For development without making actual API calls:

```
node test_scheduler_mock.js
```

## License

Proprietary - All rights reserved
