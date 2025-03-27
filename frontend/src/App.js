import React from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import Navbar from './components/Navbar';
import AppointmentType from './pages/AppointmentType';
import ScheduleAppointment from './pages/ScheduleAppointment';
import AppointmentConfirmation from './pages/AppointmentConfirmation';

function App() {
  return (
    <div className="App">
      <Navbar />
      <div className="container">
        <Routes>
          <Route path="/" element={<AppointmentType />} />
          <Route path="/schedule/:appointmentTypeId" element={<ScheduleAppointment />} />
          <Route path="/confirmation/:appointmentId" element={<AppointmentConfirmation />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
