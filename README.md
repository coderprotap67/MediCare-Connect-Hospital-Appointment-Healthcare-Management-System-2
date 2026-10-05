# 🖥️ MediCare Connect – Server Side API Engine

[![API Status](https://img.shields.io/badge/API_Status-Online-brightgreen?style=for-the-badge)](https://healthcare-management-taupe.vercel.app)
[![Node.js](https://img.shields.io/badge/Runtime-Node.js-green?style=for-the-badge&logo=nodedotjs)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Framework-Express.js-lightgrey?style=for-the-badge&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB-forestgreen?style=for-the-badge&logo=mongodb)](https://www.mongodb.com/)

This is the dedicated backend server for **MediCare Connect**, powering secure authentication, role-based access control (Patient, Doctor, Admin), healthcare appointment bookings, Stripe payment intents, and real-time MongoDB database operations.

---

## 🔗 Project Links & Live Base API

- **🌐 Live API Base URL:** https://healthcare-management-system-iota-one.vercel.app
- **💻 Client Repository:** [MediCare Connect Client Repo](https://github.com/coderprotap67/MediCare-Connect-Hospital-Appointment-Healthcare-Management-System-1.git)
- **🖥️ Server Repository:** [MediCare Connect Server Repo](https://github.com/coderprotap67/MediCare-Connect-Hospital-Appointment-Healthcare-Management-System-2.git)

---

## 🚀 Key Backend Features

- **🔒 JWT & Role-Based Security:** Custom middleware verifying JSON Web Tokens and authorizing user access based on roles (`patient`, `doctor`, `admin`).
- **💳 Stripe Payment Intent Processing:** Server-side payment client secret generation and transaction validation.
- **🔍 Advanced Search, Multi-Criteria Sorting & Pagination:** Optimized database aggregation for dynamic doctor filtering, fee/experience sorting, and server-side pagination.
- **🩺 Comprehensive CRUD Operations:** Endpoints for Appointments, Prescriptions, Doctor Profiles, User Roles, and Reviews.
- **📊 Analytics Pipeline:** Aggregated statistics powering Recharts analytics in the Admin Dashboard.

---

## 🛠️ Tech Stack & Dependencies

- **Runtime Environment:** Node.js
- **Web Framework:** Express.js
- **Database:** MongoDB Atlas (Native MongoDB Node Driver)
- **Authentication & Security:** JSON Web Tokens (`jsonwebtoken`), CORS (`cors`), `dotenv`
- **Payment Processing:** Stripe Node.js SDK (`stripe`)

---

## 🗄️ Database Schema & Collections

The backend connects to MongoDB database `medicareDB` with **6 core collections**:

1. **`users`**: Account credentials, profile details, and system roles (`patient`, `doctor`, `admin`).
2. **`doctors`**: Specialization, experience, fees, available consultation slots, and verification status (`pending`, `approved`).
3. **`appointments`**: Patient-doctor appointment bookings, date, time slot, payment status (`unpaid`, `paid`), and status (`pending`, `accepted`, `completed`, `cancelled`).
4. **`payments`**: Stripe payment receipts (`transactionId`, `amount`, `paymentDate`, `appointmentId`).
5. **`prescriptions`**: Medical diagnosis, dosages, medicines, and physician notes.
6. **`reviews`**: Ratings (1 to 5 stars) and written reviews submitted by patients.

---

## 📡 API Endpoints Summary

### 🔑 Authentication & Users (`/api/users`)
- `POST /api/users` – Create or sync authenticated user account
- `GET /api/users` – Fetch all users (Admin Authorization required)
- `PATCH /api/users/:id/role` – Update user permission role (Admin only)

### 🩺 Doctor Management (`/api/doctors`)
- `GET /api/doctors` – Search, sort, and paginate doctor list
- `GET /api/doctors/:id` – Retrieve individual doctor profile
- `POST /api/doctors` – Submit new doctor registration profile
- `PATCH /api/doctors/:id/verify` – Approve or reject doctor verification (Admin only)

### 📅 Appointments (`/api/appointments`)
- `POST /api/appointments` – Create new patient appointment
- `GET /api/appointments/patient/:email` – Retrieve appointments for specific patient
- `GET /api/appointments/doctor/:email` – Retrieve appointments for specific doctor
- `PATCH /api/appointments/:id/status` – Update booking status (`accepted`, `rejected`, `completed`)

### 💳 Stripe Payments (`/api/payments`)
- `POST /api/payments/create-payment-intent` – Generate Stripe payment client secret
- `POST /api/payments/records` – Record payment logs and mark appointment as `paid`
