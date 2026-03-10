import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_lmUwm-mI8qZvJlrN4ezKmIJg6YtPQDc",
  authDomain: "billiard-d3767.firebaseapp.com",
  projectId: "billiard-d3767",
  storageBucket: "billiard-d3767.firebasestorage.app",
  messagingSenderId: "195327033998",
  appId: "1:195327033998:web:84e2626745f6ea21183fdf",
  measurementId: "G-WCRHC6CQFS"
};

// Expose app instance globally in case other scripts need it later.
window.firebaseApp = initializeApp(firebaseConfig);
