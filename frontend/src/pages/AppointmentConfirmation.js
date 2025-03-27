import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import './Pages.css';

const AppointmentConfirmation = () => {
  const location = useLocation();
  const { appointment, patientName, email, appointmentType } = location.state || {};

  // If there's no appointment data in the state, show an error
  if (!appointment) {
    return (
      <div className="confirmation-container error-container">
        <h1>Error</h1>
        <p>No appointment information found. Please try booking again.</p>
        <Link to="/" className="btn">Book New Appointment</Link>
      </div>
    );
  }

  // Format date and time for display
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    
    return {
      date: date.toLocaleDateString(undefined, dateOptions),
      time: date.toLocaleTimeString(undefined, timeOptions)
    };
  };

  const { date, time } = formatDateTime(appointment.startTime);

  return (
    <div className="confirmation-container">
      <div className="confirmation-header">
        <h1>Appointment Confirmed!</h1>
        <div className="confirmation-check">✓</div>
      </div>
      
      <div className="confirmation-card">
        <h2>Appointment Details</h2>
        
        <div className="confirmation-details">
          <div className="detail-item">
            <span className="detail-label">Appointment Type:</span>
            <span className="detail-value">{appointmentType?.displayName || 'Not specified'}</span>
          </div>
          
          <div className="detail-item">
            <span className="detail-label">Date:</span>
            <span className="detail-value">{date}</span>
          </div>
          
          <div className="detail-item">
            <span className="detail-label">Time:</span>
            <span className="detail-value">{time}</span>
          </div>
          
          <div className="detail-item">
            <span className="detail-label">Patient Name:</span>
            <span className="detail-value">{patientName}</span>
          </div>
          
          <div className="detail-item">
            <span className="detail-label">Email:</span>
            <span className="detail-value">{email}</span>
          </div>
          
          <div className="detail-item">
            <span className="detail-label">Confirmation Number:</span>
            <span className="detail-value">{appointment.id}</span>
          </div>
        </div>
      </div>
      
      <div className="confirmation-actions">
        <Link to="/" className="btn">Book Another Appointment</Link>
      </div>
      
      <div className="confirmation-notes">
        <h3>Important Information</h3>
        <ul>
          <li>Please arrive 15 minutes before your appointment time.</li>
          <li>If you need to cancel or reschedule, please call us at least 24 hours in advance.</li>
          <li>A confirmation email has been sent to your email address.</li>
        </ul>
      </div>
    </div>
  );
};

export default AppointmentConfirmation;
