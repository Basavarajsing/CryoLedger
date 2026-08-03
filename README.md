# CryoLedger: Product Authentication & Authorized Location Verification System

CryoLedger is an advanced, location-intelligent supply chain assurance platform designed to help manufacturers reduce grey-market distribution, verify genuine product chains, and authenticate origins.

---

## 🚀 Key Features

*   **Secure Product Registration:** Manufacturers can register products, set headquarter coordinates, and assign multiple authorized retail or service centers.
*   **Role-based Authentication:** Secure access utilizing JWT (JSON Web Tokens) for Admins, Manufacturers, Retailers, and Users.
*   **Coordinate-Based Verification:** Evaluates verifier latitude/longitude coordinates against registered authorized centers using the mathematical **Haversine Distance Formula** (100 meters default radius).
*   **Administrative Bypass Flow:** Access requests can be sent by inspectors if outside designated zones. Admins can review, approve, or reject bypass requests in real-time.
*   **QR Code Serialization:** Automatically generates a high-contrast QR code for each registered product linking to `/verify.html?productId=ID`.
*   **Nominatim Search Integration:** Built-in OSM mapping and geocoding search for simplified coordinates configuration on an interactive map.

---

## 🛠️ Technology Stack

1.  **Backend:** Node.js, Express.js, MongoDB Atlas, Mongoose, `qrcode`, `jsonwebtoken`, `bcryptjs`.
2.  **Frontend:** Vanilla HTML5, Vanilla CSS3, Vanilla JavaScript, Leaflet.js with OpenStreetMap.
3.  **APIs:** Nominatim Search API (Free geocoding).

---

## 🗂️ Project Directory Structure

```text
CryoLedger/
├── models/                      # MongoDB Mongoose Schemas (Product, User, etc.)
├── public/                      # Static Assets Served by Express (Frontend)
├── services/                    # Email and other business logic services
├── utils/                       # Generic helpers
├── .env.example                 # Example environment variables
├── .gitignore                   # Ignored files (node_modules, logs, env)
├── package.json                 # Dependency manifests
├── server.js                    # Core Express server & API routes
└── README.md                    # Project guidance
```

---

## 💾 Installation & Setup

### Prerequisites
*   **Node.js** (v16.0 or higher recommended)
*   **MongoDB Atlas** account (or local MongoDB)
*   **Git**

### 1. Download Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your values. Do not commit `.env` to version control!
```bash
cp .env.example .env
```
**Required Variables:**
- `MONGODB_URI`: Connection string to your database (Atlas)
- `EMAIL_USER`: App email
- `EMAIL_PASS`: App email password
- `JWT_SECRET`: Secret hash for JWT configuration

### 3. Start the Application
Initialize the Express server process:
```bash
npm run dev
```
The server will boot on **`http://localhost:5000`**.

---

## 🚀 Build & Deployment Instructions

### Standalone Monolith (Render)
As the frontend is currently served statically through the Node.js backend:
1. Push this repository to GitHub.
2. Sign up on [Render](https://render.com).
3. Create a new "Web Service" and connect your GitHub repo.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Enter Environment Variables from your `.env` securely into Render.
7. Click "Deploy".

### Frontend (Vercel / Netlify) [Optional Split]
To deploy the frontend separately on Vercel:
1. Connect Vercel to your GitHub repository.
2. Set the "Root Directory" to `public`.
3. In `public/js/utils.js` (or similar network files), update API calls from relative paths (`/api/...`) to the remote Render backend absolute URL (`https://your-render-backend.onrender.com/api/...`).

---

## 🌐 Application Endpoints

Once the platform is running locally, access these entrypoints:
*   **Home Dashboard:** `http://localhost:5000/index.html`
*   **Add Product Form:** `http://localhost:5000/add-product.html`
*   **Verify Coordinates Form:** `http://localhost:5000/verify.html`
*   **Admin Bypass Console:** `http://localhost:5000/admin.html`
*   **Audit Records Directory:** `http://localhost:5000/records.html`
