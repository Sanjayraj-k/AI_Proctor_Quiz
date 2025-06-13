import React, { useState, useEffect } from 'react';
import { Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import FaceDetection from "./pages/FaceDetection";
import Layout from "./components/Layout";
import UserSelect from "./pages/UserSelect";
import Protected from "./pages/Protected";
import GoogleFormWithWebcam from './pages/GoogleForm';
import UploadPage from './pages/UploadPage';
import WebCam from './pages/webCam';
import Result from "./pages/Result";
import LandingPage from './LandingPage';
import TeacherDashboard from './TeacherDashboard';
import StudentDashboard from './StudentDashboard';
import TeacherAuth from './pages/TeacherLogin';

function App() {
  const [resumeData, setResumeData] = useState(null);
  const [isTeacherAuthenticated, setIsTeacherAuthenticated] = useState(false);
  const [teacherData, setTeacherData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedTeacherData = localStorage.getItem('teacherData');
    if (storedTeacherData) {
      setIsTeacherAuthenticated(true);
      setTeacherData(JSON.parse(storedTeacherData));
    }
  }, []);

  useEffect(() => {
    if (isTeacherAuthenticated) {
      console.log('Teacher authenticated, redirecting to dashboard');
      navigate('/teacher/dashboard', { replace: true });
    }
  }, [isTeacherAuthenticated, navigate]);

  const handleTeacherLogin = (userData) => {
    setIsTeacherAuthenticated(true);
    setTeacherData(userData);
  };

  const handleTeacherLogout = () => {
    setIsTeacherAuthenticated(false);
    setTeacherData(null);
    localStorage.removeItem('teacherData');
  };

  const ProtectedTeacherRoute = ({ children }) => {
    return isTeacherAuthenticated ? children : <Navigate to="/teacher/login" replace />;
  };

  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route 
          path="/teacher/login" 
          element={
            isTeacherAuthenticated ? 
            <Navigate to="/teacher/dashboard" replace /> : 
            <TeacherAuth onLoginSuccess={handleTeacherLogin} />
          } 
        />
        
        <Route 
          path="/teacher/dashboard" 
          element={
            <ProtectedTeacherRoute>
              <TeacherDashboard 
                teacherData={teacherData} 
                onLogout={handleTeacherLogout} 
              />
            </ProtectedTeacherRoute>
          } 
        />

        <Route 
          path="/teacher" 
          element={
            isTeacherAuthenticated ? 
            <Navigate to="/teacher/dashboard" replace /> : 
            <Navigate to="/teacher/login" replace />
          } 
        />

        <Route path="/student" element={<StudentDashboard />} />

        <Route path="/uploadface" element={<UserSelect />} />
        <Route path="/face" element={<FaceDetection />} />
        <Route path="/googleform" element={<GoogleFormWithWebcam />} />
        <Route path="/web" element={<WebCam />} />
        <Route path="/result" element={<Result />} />

        <Route path="/protected" element={<Protected />} />

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