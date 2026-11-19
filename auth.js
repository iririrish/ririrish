import { auth } from "./firebase-config.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, GoogleAuthProvider, signInWithPopup, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export const watchAuth = (cb) => onAuthStateChanged(auth, cb);
export const login = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export async function register(name, email, pw) {
  const cred = await createUserWithEmailAndPassword(auth, email, pw);
  if (name) await updateProfile(cred.user, { displayName: name });
  return cred;
}
export const googleLogin = () => signInWithPopup(auth, new GoogleAuthProvider());
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);
export const logout = () => signOut(auth);

const MESSAGES = {
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/user-not-found": "No account uses that email.",
  "auth/wrong-password": "Email or password is incorrect.",
  "auth/email-already-in-use": "An account with that email already exists. Try signing in.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
  "auth/unauthorized-domain": "This domain is not authorized in Firebase Authentication settings.",
  "auth/network-request-failed": "Network problem. Check your connection and try again."
};
export const authMessage = (e) => MESSAGES[e.code] || e.message || "Something went wrong.";
