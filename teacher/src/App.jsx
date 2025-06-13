import React, { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import FaceDetection from "./pages/FaceDetection";
import Layout from "./components/Layout";
import UserSelect from "./pages/UserSelect";
import Protected from "./pages/Protected";
import GoogleFormWithWebcam from './pages/GoogleForm';
import UploadPage from './pages/UploadPage';
import WebCam from './pages/webCam';
import Result from "./pages/Result";
import LandingPage from './LandingPage'; // Import LandingPage
import TeacherDashboard from './TeacherDashboard';
import StudentDashboard from './StudentDashboard'; // Import StudentDashboard

function App() {
  const [resumeData, setResumeData] = useState(null);

  return (
    <div className="App">
      <Routes>
        {/* Landing Page */}
        <Route path="/" element={<LandingPage />} />

        {/* Teacher Routes */}
        <Route path="/teacher" element={<TeacherDashboard />} />

        {/* Student Routes */}
        <Route path="/student" element={<StudentDashboard />} />

        {/* Proctoring System Routes (for Students) */}
        <Route path="/uploadface" element={<UserSelect />} />
        <Route path="/face" element={<FaceDetection />} />
        <Route path="/googleform" element={<GoogleFormWithWebcam />} />
        <Route path="/web" element={<WebCam />} />
        <Route path="/result" element={<Result />} />

        {/* Protected Route */}
        <Route path="/protected" element={<Protected />} />

        {/* Nested Routes with Layout */}
        <Route element={<Layout />}>
          <Route path="/uploadface" element={<UserSelect />} />
          <Route path="/face" element={<FaceDetection />} />
          <Route path="/protected" element={<Protected />} />
        </Route>
      </Routes>
    </div>
  );
}

export default App;