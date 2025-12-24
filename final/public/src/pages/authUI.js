// ----- AUTH UI CONTROLLER -----
import {
  getStorageItem,
  setStorageItem,
} from '../utils.js';
import { Total } from '../cart/setupCart.js';

const getElement = (selection) => {
  const element = document.querySelector(selection);
  if (element) return element;
  throw new Error(
    `Please check "${selection}" selector, no such element exist`
  );
};

function updateAuthUI() {
  const token = localStorage.getItem("token");
  const user = localStorage.getItem("user");
  const username = localStorage.getItem("username");
  const profileArea = getElement('.profile-area');
  const signInButton = getElement('#sign-in')
  
  if (token) {
    // Logged in
    signInButton.style.display = "none";
    console.log("logged in");
    profileArea.innerHTML = `
      <div class="profile-icon">${username[0].toUpperCase()}</div>
      <button id="logoutBtn">Log out</button>
    `;

    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        setStorageItem('cart', []);
        window.location.reload();
      });
  } else {
    // Not logged in
    profileArea.innerHTML = "";
    setStorageItem('cart', []);
    
  }
}

document.querySelector('.cart-checkout').addEventListener('click', async () => {
  try {
    // Get cart total from your logic
    const token = localStorage.getItem('token');
    if (!token) { alert("Please login"); return; }

    // Example: compute total on client or ask server to compute securely
    const total = (Total()/100).toFixed(2);
    console.log(total);
    
    const user = JSON.parse(localStorage.getItem("user")); 
    console.log(user.email);
    // Call server to create chapa transaction
    const res = await fetch('/api/create-chapa-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ amount: total, currency: 'ETB', gmail: user.email })
    });

    const data = await res.json();
    if (!res.ok) {
      console.error(data);
      alert(data.message || 'Failed to start payment');
      return;
    }

    // Redirect the user to Chapa's checkout page
    window.location.href = data.checkout_url;
  } catch (err) {
    console.error(err);
    alert('Payment failed to initialize');
  }
});

document.addEventListener("DOMContentLoaded", updateAuthUI);
