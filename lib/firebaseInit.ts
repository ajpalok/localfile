import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';
import { getAuth, signInAnonymously, Auth, onAuthStateChanged } from 'firebase/auth';
import { firebaseConfig } from './firebase';

let app: FirebaseApp;
let database: Database;
let auth: Auth;
let authReady: Promise<void>;

// Initialize Firebase
export const initFirebase = async () => {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
    auth = getAuth(app);

    // Sign in anonymously so database rules can enforce auth != null
    // This ensures only requests via the Firebase SDK (from this app) are allowed
    authReady = new Promise<void>((resolve, reject) => {
      // Check if already signed in (e.g. on hot reload)
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        if (user) {
          console.log('Firebase: already authenticated anonymously', user.uid);
          resolve();
        } else {
          signInAnonymously(auth)
            .then((credential) => {
              console.log('Firebase: signed in anonymously', credential.user.uid);
              resolve();
            })
            .catch((error) => {
              console.error('Firebase: anonymous sign-in failed', error);
              reject(error);
            });
        }
      });
    });

    console.log('Connected to Firebase Database (live)');
  } else {
    app = getApps()[0];
    database = getDatabase(app);
    auth = getAuth(app);
  }

  // Always wait for auth to be ready before returning
  await authReady;
  return { app, database, auth };
};
