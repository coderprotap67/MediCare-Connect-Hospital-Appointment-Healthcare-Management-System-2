import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'https://localhost:3000'
  ],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$\%^&*]{6,}$/;
  return passwordRegex.test(password);
};

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const db = client.db('medicareDB');
    const usersCollection = db.collection('users');
    const doctorsCollection = db.collection('doctors');
    const appointmentsCollection = db.collection('appointments');
    const reviewsCollection = db.collection('reviews');
    const paymentsCollection = db.collection('payments');
    const prescriptionsCollection = db.collection('prescriptions');

    const verifyUser = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access: No token provided' });
      }
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.JWT_SECRET || 'medicare_secret_key', (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized access: Invalid or expired token' });
        }
        req.user = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.user?.email;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden access: Admin only' });
      }
      next();
    };

    const verifyDoctor = async (req, res, next) => {
      const email = req.user?.email;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== 'doctor') {
        return res.status(403).send({ message: 'Forbidden access: Doctor only' });
      }
      next();
    };

    app.post('/api/auth/jwt', async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) return res.status(400).send({ message: 'Email is required' });

        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ message: 'User not found' });

        const token = jwt.sign(
          { email: user.email, role: user.role, name: user.name },
          process.env.JWT_SECRET || 'medicare_secret_key',
          { expiresIn: '7d' }
        );

        res.send({
          token,
          user: {
            name: user.name,
            email: user.email,
            role: user.role,
            photo: user.photo || ''
          }
        });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.post('/api/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;
        if (!email || !password) {
          return res.status(400).send({ message: 'Email and password are required' });
        }

        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: 'Invalid email or password' });
        }
        if (user.password && user.password !== password) {
          return res.status(400).send({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
          { email: user.email, role: user.role },
          process.env.JWT_SECRET || 'medicare_secret_key',
          { expiresIn: '7d' }
        );

        res.send({
          status: true,
          message: 'Login successful',
          token,
          user: {
            name: user.name,
            email: user.email,
            role: user.role,
            photo: user.photo || ''
          }
        });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.post('/api/auth/register', async (req, res) => {
      try {
        const { name, email, password, role, photo, phone, gender } = req.body;
        if (!name || !email || !password) {
          return res.status(400).send({ message: 'Name, email, and password are required fields.' });
        }
        if (!validatePassword(password)) {
          return res.status(400).send({
            message: 'Password must be at least 6 characters, contain 1 number and 1 special character.'
          });
        }
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).send({ message: 'User already exists with this email address.' });
        }
        const newUser = {
          name,
          email,
          role: role || 'patient',
          photo: photo || '',
          phone: phone || '',
          gender: gender || 'unspecified',
          status: 'active',
          createdAt: new Date()
        };
        const result = await usersCollection.insertOne(newUser);
        if (role === 'doctor') {
          await doctorsCollection.updateOne(
            { email },
            {
              $set: {
                doctorName: name,
                email,
                verificationStatus: 'unverified',
                createdAt: new Date()
              }
            },
            { upsert: true }
          );
        }
        res.status(201).send({ status: true, message: 'Registration successful', result });
      } catch (err) {
        res.status(500).send({ message: err.message || 'Internal Server Error' });
      }
    });

    app.get('/api/doctors', async (req, res) => {
      try {
        const { search, specialization, sortBy, sortOrder, page = 1, limit = 6 } = req.query;
        let query = { verificationStatus: 'verified' };
        if (search) {
          query.doctorName = { $regex: search,$options: 'i' };
        }
        if (specialization && specialization !== 'All') {
          query.specialization = specialization;
        }
        let sortOptions = {};
        if (sortBy) {
          sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
        } else {
          sortOptions.createdAt = -1;
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const doctors = await doctorsCollection.find(query).sort(sortOptions).skip(skip).limit(parseInt(limit)).toArray();
        const total = await doctorsCollection.countDocuments(query);
        res.send({ doctors, totalPages: Math.ceil(total / limit), totalCount: total });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/doctors/:id', async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: 'Invalid Doctor ID' });
        }
        const doctor = await doctorsCollection.findOne({ _id: new ObjectId(id) });
        if (!doctor) return res.status(404).send({ message: 'Doctor not found' });
        res.send(doctor);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/reviews', async (req, res) => {
      try {
        const reviews = await reviewsCollection.find().limit(10).toArray();
        res.send(reviews);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/stats', async (req, res) => {
      try {
        const totalDoctors = await doctorsCollection.countDocuments({ verificationStatus: 'verified' });
        const totalPatients = await usersCollection.countDocuments({ role: 'patient' });
        const totalAppointments = await appointmentsCollection.countDocuments({ appointmentStatus: 'completed' });
        res.send({ totalDoctors, totalPatients, totalAppointments });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.post('/api/users', async (req, res) => {
      try {
        const user = req.body;
        if (!user.email) return res.status(400).send({ message: 'Email is required.' });
        const query = { email: user.email };
        const existingUser = await usersCollection.findOne(query);
        if (existingUser) return res.send({ message: 'User already exists', insertedId: null });
        const result = await usersCollection.insertOne({
          ...user,
          role: user.role || 'patient',
          createdAt: new Date(),
          status: 'active'
        });
   
      } catch (err) {
        res.status(500).send({ message: err.message 
      }
    });

    app.put('/api/users/profile', verifyUser, async (req, res) => {
      try {
        const email = req.user.email;
        const { displayName, name, phone, address, photoURL, photo } = req.body;

        const updatedData = {
          name: displayName || name || req.user.name,
          phone: phone !== undefined ? phone : req.user.phone,
          address: address !== undefined ? address : req.user.address,
          photo: photoURL || photo || req.user.photo,
          updatedAt: new Date()
        };
        const result = await usersCollection.updateOne(
          { email },
          { $set: updatedData }
        );

        res.send({ status: true, message: 'Profile updated successfully', result });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.post('/api/appointments', verifyUser, async (req, res) => {
      try {
        const appointment = req.body;
        appointment.patientEmail = req.user.email;
        appointment.appointmentStatus = 'pending';
        appointment.paymentStatus = 'unpaid';
        appointment.createdAt = new Date();
        const result = await appointmentsCollection.insertOne(appointment);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/patient/appointments', verifyUser, async (req, res) => {
      try {
        const patientId = req.user.email;
        const appointments = await appointmentsCollection.find({ patientEmail: patientId }).toArray();
        res.send(appointments);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.patch('/api/appointments/:id/cancel', verifyUser, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid Appointment ID' });
        const result = await appointmentsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { appointmentStatus: 'rejected' } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.post('/api/reviews', verifyUser, async (req, res) => {
      try {
        const review = req.body;
        review.patientEmail = req.user.email;
        review.createdAt = new Date();
        const result = await reviewsCollection.insertOne(review);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/reviews/user/:email', verifyUser, async (req, res) => {
      try {
        const reviews = await reviewsCollection.find({ patientEmail: req.params.email }).toArray();
        res.send(reviews);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.patch('/api/reviews/:id', verifyUser, async (req, res) => {
      try {
        const { rating, comment, reviewText } = req.body;
        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { rating, reviewText: reviewText || comment, updatedAt: new Date() } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.delete('/api/reviews/:id', verifyUser, async (req, res) => {
      try {
        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/prescriptions/patient/:email', verifyUser, async (req, res) => {
      try {
        const prescriptions = await prescriptionsCollection
          .find({ patientEmail: req.params.email })
          .toArray();
        res.send(prescriptions);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.post('/api/doctor/profile', verifyUser, verifyDoctor, async (req, res) => {
      try {
        const doctorData = req.body;
        doctorData.email = req.user.email;
        doctorData.verificationStatus = 'unverified';
        const query = { email: req.user.email };
        const updatedDoc = { $set: doctorData };
        const result = await doctorsCollection.updateOne(query, updatedDoc, { upsert: true });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/doctor/appointments', verifyUser, verifyDoctor, async (req, res) => {
      try {
        const doctorEmail = req.user.email;
        const appointments = await appointmentsCollection.find({ doctorEmail }).toArray();
        res.send(appointments);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.patch('/api/appointments/:id/status', verifyUser, verifyDoctor, async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid Appointment ID' });
        const result = await appointmentsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { appointmentStatus: status } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/doctor/schedule', verifyUser, verifyDoctor, async (req, res) => {
      try {
        const email = req.user.email;
        const doctor = await doctorsCollection.findOne({ email });
        res.send({ availableSlots: doctor?.availableSlots || [] });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.post('/api/doctor/schedule', verifyUser, verifyDoctor, async (req, res) => {
      try {
        const email = req.user.email;
        const { availableSlots } = req.body;
        const result = await doctorsCollection.updateOne(
          { email },
          { $set: { availableSlots, updatedAt: new Date() } },
          { upsert: true }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.post('/api/prescriptions', verifyUser, verifyDoctor, async (req, res) => {
      try {
        const prescription = req.body;
        prescription.doctorEmail = req.user.email;
        prescription.createdAt = new Date();
        const result = await prescriptionsCollection.insertOne(prescription);
        if (prescription.appointmentId && ObjectId.isValid(prescription.appointmentId)) {
          await appointmentsCollection.updateOne(
            { _id: new ObjectId(prescription.appointmentId) },
            { $set: { appointmentStatus: 'completed' } }
          );
        }
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/admin/users', verifyUser, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.patch('/api/admin/users/:id/role', verifyUser, verifyAdmin, async (req, res) => {
      try {
        const { role } = req.body;
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { role, updatedAt: new Date() } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.patch('/api/admin/users/:id/status', verifyUser, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid User ID' });
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status, updatedAt: new Date() } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/admin/doctors', verifyUser, verifyAdmin, async (req, res) => {
      try {
        const doctors = await doctorsCollection.find().toArray();
        res.send(doctors);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.patch('/api/admin/doctors/:id/verify', verifyUser, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid Doctor ID' });
        const result = await doctorsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { verificationStatus: status } }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/admin/analytics', verifyUser, verifyAdmin, async (req, res) => {
      try {
        const payments = await paymentsCollection.find().toArray();
        const totalRevenue = payments.reduce((acc, curr) => acc + (curr.amount || 0), 0);
        const totalDoctors = await doctorsCollection.countDocuments();
        const totalPatients = await usersCollection.countDocuments({ role: 'patient' });
        const totalAppointments = await appointmentsCollection.countDocuments();
        res.send({ totalRevenue, totalDoctors, totalPatients, totalAppointments });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.post('/api/create-payment-intent', verifyUser, async (req, res) => {
      try {
        const price = req.body.price || req.body.amount;
        if (!price || isNaN(price)) return res.status(400).send({ message: 'Invalid price' });
        const amount = parseInt(price * 100);
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: 'usd',
          payment_method_types: ['card']
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.post('/api/payments', verifyUser, async (req, res) => {
      try {
        const payment = req.body;
        payment.patientEmail = req.user.email;
        payment.paymentDate = new Date();
        const result = await paymentsCollection.insertOne(payment);
        if (payment.appointmentId && ObjectId.isValid(payment.appointmentId)) {
          await appointmentsCollection.updateOne(
            { _id: new ObjectId(payment.appointmentId) },
            { $set: { paymentStatus: 'paid', appointmentStatus: 'accepted' } }
          );
        }
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.get('/api/payments/history', verifyUser, async (req, res) => {
      try {
        const query = req.user.role === 'patient' ? { patientEmail: req.user.email } : {};
        const payments = await paymentsCollection.find(query).toArray();
        res.send(payments);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    console.log("Successfully connected to MongoDB.");
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('MediCare Connect Backend Operating...');
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});