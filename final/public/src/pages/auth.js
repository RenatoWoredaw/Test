// global imports
import '../toggleSidebar.js';

// Toggle between login and signup
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const formTitle = document.getElementById('form-title');

document.getElementById('to-signup').addEventListener('click', () => {
  loginForm.classList.remove('active');
  signupForm.classList.add('active');
  formTitle.textContent = 'Sign Up';
});

document.getElementById('to-login').addEventListener('click', () => {
  signupForm.classList.remove('active');
  loginForm.classList.add('active');
  formTitle.textContent = 'Login';
});

// Example form submit handling (to be connected with your backend)
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  // Example: Send data to your backend (replace URL)
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();

  if (res.ok) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("username", (data.user.name));
    window.location.href = "/index.html";
  }
  alert(data.message || 'Login request sent!');
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;

  const res = await fetch('/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });

  const data = await res.json();

  if (res.ok) {
    setTimeout(() => {
      window.location.href = `verify.html?email=${encodeURIComponent(email)}`;
    }, 1500);
  }

  alert(data.message || 'Signup request sent!');
});

