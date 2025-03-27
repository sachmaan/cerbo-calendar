import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Pages.css';
import { getAppointmentTypes } from '../api/appointmentService';

const AppointmentType = () => {
  const [appointmentTypes, setAppointmentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAppointmentTypes = async () => {
      try {
        setLoading(true);
        const response = await getAppointmentTypes();
        
        if (response.success) {
          setAppointmentTypes(response.appointmentTypes);
        } else {
          setError(response.error || 'Failed to fetch appointment types');
        }
      } catch (err) {
        setError('Error connecting to server');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchAppointmentTypes();
  }, []);

  const handleTypeSelect = (typeId) => {
    navigate(`/schedule/${typeId}`);
  };

  if (loading) {
    return <div className="loading">Loading appointment types...</div>;
  }

  if (error) {
    return <div className="error-container">Error: {error}</div>;
  }

  return (
    <div className="appointment-type-container">
      <h1>Select Appointment Type</h1>
      
      {appointmentTypes.length === 0 ? (
        <p>No appointment types available</p>
      ) : (
        <div className="appointment-type-list">
          {appointmentTypes.map((type) => (
            <div 
              key={type.id} 
              className="appointment-type-card"
              onClick={() => handleTypeSelect(type.id)}
            >
              <h2>{type.displayName}</h2>
              <p>{type.description}</p>
              <div className="appointment-type-details">
                <span>Duration: {type.duration} minutes</span>
                {type.dualBookable && (
                  <span className="dual-bookable">Can be dual booked</span>
                )}
              </div>
              <button className="btn">Select</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AppointmentType;
