import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyD-mblK3hPjo5bLDxgBjVkN-ajXhNTsxls",
  authDomain: "billiard-61.firebaseapp.com",
  projectId: "billiard-61",
  storageBucket: "billiard-61.firebasestorage.app",
  messagingSenderId: "353223372621",
  appId: "1:353223372621:web:c40710808be8afb243d104"
};

// Expose app instance globally in case other scripts need it later.
window.firebaseApp = initializeApp(firebaseConfig);
