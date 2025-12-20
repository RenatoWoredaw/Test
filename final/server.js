const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const nodemailer = require("nodemailer");
//import jwt from "jsonwebtoken";
const jwt = require("jsonwebtoken")
const User = require('./Models/User');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

const router = express.Router();
const CHAPA_INIT_URL = "https://api.chapa.co/v1/transaction/initialize";
const CHAPA_VERIFY_URL = "https://api.chapa.co/v1/transaction/verify"; // append /<tx_ref>
const CHAPA_SECRET = process.env.CHAPA_SECRET_KEY;
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serves your frontend files

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/furniture', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

const JWT_SECRET = process.env.JWT_SECRET; // use process.env.JWT_SECRET in production

// ✅ Nodemailer setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ------------------------
// SIGNUP ROUTE
// ------------------------
app.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: 'Email already registered' });

    const newUser = new User({ name, email, password, verificationCode: code });

    // Send email with code
    await transporter.sendMail({
      from: `"Furniture Store" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your Email",
      text: `Your verification code is ${code}`,
    });

    console.log(`Verification code sent to ${email}`);

    await newUser.save();

    res.status(201).json({success: true, message: 'User registered successfully!' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ------------------------
// LOGIN ROUTE
// ------------------------
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: 'Invalid email or password' });

    //const isMatch = await user.comparePassword(password);
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: 'Invalid email or password' });

    // create token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });
    res.json({ message: 'Login successful', token, user: { id: user._id, name: user.name, email: user.email, cart: user.cart } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Verify Route
app.post("/verify", async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.verificationCode !== code)
      return res.status(400).json({ message: "Invalid verification code." });

    user.isVerified = true;
    user.verificationCode = null;
    await user.save();

    res.json({ message: "Email verified successfully!" });
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).json({ message: "Server error." });
  }
});

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1]; // get token after "Bearer"
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.userId = decoded.id; // store user ID for use in next steps
    next();
  });
}

app.get("/get-cart", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ cart: user.cart });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Utility to generate unique tx_ref
function genTxRef() {
  // tx_ref should be unique. Use timestamp + random
  return `order_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

// 1) Create a transaction and return checkout_url
app.post("/api/create-chapa-transaction", verifyToken, async (req, res) => {
  try {
    const { amount, currency = "ETB", email } = req.body;

    const first_name = "Customer"; // Default name
    const last_name = "User";     // Optional
    
    if (!amount) return res.status(400).json({ message: "Amount required" });

    // const user = await req.user;
    // if (!user) return res.status(404).json({ message: "User not found" });

    const tx_ref = genTxRef();
    const payload = {
      amount: amount.toString(),   // chapa expects string
      currency,
      tx_ref,
      first_name: first_name || user.username || "Customer",
      last_name: last_name || "",
      email: email,
      callback_url: `${BASE_URL}/api/chapa/callback`, // chapa will call/redirect here
      // optional: return_url (where user lands after payment)
      return_url: `${BASE_URL}/payment-success?tx_ref=${tx_ref}`
    };

    const resp = await fetch(CHAPA_INIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CHAPA_SECRET}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("Chapa init error:", data);
      return res.status(400).json({ message: "Chapa initialize failed", data });
    }

    // data.data.checkout_url contains the link to redirect the user
    return res.json({ checkout_url: data.data.checkout_url, tx_ref });
  } catch (err) {
    console.error("create-chapa-transaction error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// 2) Chapa callback endpoint (server receives POST/GET)
app.post('/chapa/callback', async (req, res) => {
  // Chapa may POST data or redirect user; always verify using tx_ref
  const tx_ref = req.body?.tx_ref || req.query?.tx_ref;
  console.log('Chapa callback received for tx_ref=', tx_ref);

  if (!tx_ref) return res.status(400).send('tx_ref missing');

  try {
    // Verify transaction status
    const verifyResp = await fetch(`${CHAPA_VERIFY_URL}/${tx_ref}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${CHAPA_SECRET}` }
    });
    const verifyData = await verifyResp.json();

    if (!verifyResp.ok) {
      console.error("Chapa verify error:", verifyData);
      return res.status(500).json({ message: "Verification failed", verifyData });
    }

    const status = verifyData.data.status; // e.g., "success", "pending", "failed"
    const chapaAmount = verifyData.data.amount;
    const chapaTxnRef = verifyData.data.tx_ref;

    if (status === 'success') {
      // Save order + clear user's cart
      // IMPORTANT: find user by email or tx_ref mapping. If you saved tx_ref to DB earlier, use that.
      const email = verifyData.data.customer?.email;
      const user = await User.findOne({ email });
      if (user) {
        // create order record (optional): push to user.orders or separate Orders collection
        const order = {
          tx_ref: chapaTxnRef,
          amount: chapaAmount,
          status: 'paid',
          createdAt: new Date(),
          items: user.cart || []
        };
        // Example: push to orders array on user (if schema supports)
        user.orders = user.orders || [];
        user.orders.push(order);

        // Clear cart
        user.cart = [];
        await user.save();
      }

      // Respond to Chapa with success (HTTP 200)
      return res.status(200).send('Payment verified and processed');
    } else {
      // handle pending/failed
      return res.status(200).send('Payment not successful: ' + status);
    }
  } catch (err) {
    console.error('Callback verify error', err);
    return res.status(500).send('Server error');
  }
});


// Start server
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
