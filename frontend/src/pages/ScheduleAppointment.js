import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './Pages.css';
import { getAvailability, bookAppointment, getAppointmentTypes } from '../api/appointmentService';

const ScheduleAppointment = () => {
  const { appointmentTypeId } = useParams();
  const navigate = useNavigate();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [availableSlots, setAvailableSlots] = useState([]);
  const [appointmentType, setAppointmentType] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [bookingForm, setBookingForm] = useState({
    patientName: '',
    email: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [bookingInProgress, setBookingInProgress] = useState(false);

  // Fetch appointment type details
  useEffect(() => {
    const fetchAppointmentType = async () => {
      try {
        const response = await getAppointmentTypes();
        if (response.success) {
          const type = response.appointmentTypes.find(t => t.id === parseInt(appointmentTypeId, 10));
          if (type) {
            setAppointmentType(type);
          } else {
            setError('Appointment type not found');
          }
        } else {
          setError(response.error || 'Failed to fetch appointment type');
        }
      } catch (err) {
        setError('Error connecting to server');
        console.error(err);
      }
    };

    fetchAppointmentType();
  }, [appointmentTypeId]);

  // Fetch availability for the selected date range
  useEffect(() => {
    const fetchAvailability = async () => {
      try {
        setLoading(true);
        
        // Create a date range (14 days from today)
        const today = new Date();
        const twoWeeksLater = new Date();
        twoWeeksLater.setDate(today.getDate() + 14);
        
        const startDate = today.toISOString().split('T')[0];
        const endDate = twoWeeksLater.toISOString().split('T')[0];
        
        const response = await getAvailability(appointmentTypeId, startDate, endDate);
        
        if (response.success) {
          setAvailableSlots(response.availableSlots);
          
          // Extract unique dates from available slots
          const dates = [...new Set(response.availableSlots.map(slot => 
            new Date(slot.primaryBooking ? slot.primaryBooking.startTime : slot.startTime).toISOString().split('T')[0]
          ))];
          
          setAvailableDates(dates.map(date => new Date(date)));
          
          // Reset selected slot when availability changes
          setSelectedSlot(null);
        } else {
          setError(response.error || 'Failed to fetch availability');
        }
      } catch (err) {
        setError('Error connecting to server');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (appointmentTypeId) {
      fetchAvailability();
    }
  }, [appointmentTypeId]);

  // Handle date change from calendar
  const handleDateChange = (date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  // Handle time slot selection
  const handleSlotSelect = (slot) => {
    console.log('Selected slot:', slot);  // Debug the selected slot
    setSelectedSlot(slot);
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setBookingForm({
      ...bookingForm,
      [name]: value
    });
    
    // Clear errors for the field
    if (formErrors[name]) {
      setFormErrors({
        ...formErrors,
        [name]: null
      });
    }
  };

  // Validate the form
  const validateForm = () => {
    const errors = {};
    
    if (!bookingForm.patientName.trim()) {
      errors.patientName = 'Patient name is required';
    }
    
    if (!bookingForm.email.trim()) {
      errors.email = 'Email is required';
    } else if (!bookingForm.email.includes('@')) {
      errors.email = 'Please enter a valid email address';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle appointment booking
  const handleBookAppointment = async (e) => {
    e.preventDefault();
    
    if (!validateForm() || !selectedSlot) {
      return;
    }
    
    try {
      setBookingInProgress(true);
      
      console.log('Booking with slot ID:', selectedSlot.id);  // Debug the ID being sent
      
      // The API now expects just the UUID of the selected slot
      // instead of the whole slot object or its properties
      const response = await bookAppointment(
        bookingForm.patientName,
        bookingForm.email,
        selectedSlot.id  // Use the UUID assigned by the server
      );
      
      if (response.success) {
        // Navigate to confirmation page
        navigate(`/confirmation/${response.appointment.id}`, { 
          state: { 
            appointment: response.appointment,
            patientName: bookingForm.patientName,
            email: bookingForm.email,
            appointmentType: appointmentType
          } 
        });
      } else {
        setError(response.error || 'Failed to book appointment');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error(err);
    } finally {
      setBookingInProgress(false);
    }
  };

  // Filter time slots for the selected date
  const filteredSlots = availableSlots.filter(slot => {
    // Get start time from primaryBooking if available, otherwise fall back to legacy startTime
    const startTimeStr = slot.primaryBooking ? slot.primaryBooking.startTime : slot.startTime;
    const slotDate = new Date(startTimeStr);
    return slotDate.toISOString().split('T')[0] === selectedDate.toISOString().split('T')[0];
  });

  // Format time display
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Get formatted start time from a time slot
  const getSlotStartTime = (slot) => {
    const startTimeStr = slot.primaryBooking ? slot.primaryBooking.startTime : slot.startTime;
    return formatTime(startTimeStr);
  };

  // Tile class for the calendar to highlight dates with available slots
  const tileClassName = ({ date, view }) => {
    if (view === 'month') {
      const isAvailable = availableDates.some(availableDate => 
        availableDate.toISOString().split('T')[0] === date.toISOString().split('T')[0]
      );
      return isAvailable ? 'available-date' : null;
    }
  };

  if (loading && !appointmentType) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error-container">Error: {error}</div>;
  }

  return (
    <div className="schedule-container">
      <h1>Schedule {appointmentType?.displayName}</h1>
      
      <div className="scheduling-grid">
        <div className="calendar-container">
          <h2>Select Date</h2>
          <Calendar 
            onChange={handleDateChange}
            value={selectedDate}
            tileClassName={tileClassName}
            minDate={new Date()}
            maxDate={new Date(new Date().setDate(new Date().getDate() + 14))}
          />
          <div className="calendar-legend">
            <div className="legend-item">
              <div className="legend-color available"></div>
              <span>Available</span>
            </div>
            <div className="legend-item">
              <div className="legend-color selected"></div>
              <span>Selected</span>
            </div>
          </div>
        </div>
        
        <div className="timeslots-container">
          <h2>Available Times</h2>
          {filteredSlots.length === 0 ? (
            <p>No available time slots for selected date</p>
          ) : (
            <div className="timeslot-grid">
              {filteredSlots.map((slot) => {
                console.log('Rendering time slot:', slot); // Debug each slot
                return (
                  <div 
                    key={slot.id} 
                    className={`timeslot ${selectedSlot?.id === slot.id ? 'selected' : ''}`}
                    onClick={() => handleSlotSelect(slot)}
                  >
                    {getSlotStartTime(slot)}
                    {slot.hasBuffer && <span className="buffer-indicator" title="Includes buffer time">🕒</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      
      {selectedSlot && (
        <div className="booking-form-container">
          <h2>Patient Information</h2>
          <form onSubmit={handleBookAppointment}>
            <div className="form-group">
              <label htmlFor="patientName">Patient Name</label>
              <input
                type="text"
                id="patientName"
                name="patientName"
                className="form-control"
                value={bookingForm.patientName}
                onChange={handleInputChange}
                required
              />
              {formErrors.patientName && <div className="error">{formErrors.patientName}</div>}
            </div>
            
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                className="form-control"
                value={bookingForm.email}
                onChange={handleInputChange}
                required
              />
              {formErrors.email && <div className="error">{formErrors.email}</div>}
            </div>
            
            <div className="booking-summary">
              <h3>Appointment Summary</h3>
              <p><strong>Date:</strong> {selectedDate.toLocaleDateString()}</p>
              <p><strong>Time:</strong> {getSlotStartTime(selectedSlot)}</p>
              <p><strong>Type:</strong> {appointmentType?.displayName}</p>
            </div>
            
            <button 
              type="submit" 
              className="btn"
              disabled={bookingInProgress}
            >
              {bookingInProgress ? 'Booking...' : 'Book Appointment'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ScheduleAppointment;
