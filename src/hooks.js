import { createContext, useContext, useSyncExternalStore } from 'react';
import { store } from './lib/data.js';

/* Re-render on any live data / auth / alert change */
export function useStore() { return useSyncExternalStore(store.subscribe, store.getVersion); }

/* Currently selected patient (clinicians can switch; patients are locked to themselves) */
export const PatientCtx = createContext({ patient: null, setPatientId: () => {} });
export const usePatient = () => useContext(PatientCtx);
