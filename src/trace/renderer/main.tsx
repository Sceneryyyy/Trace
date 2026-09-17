import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import App from './App'
import {RecoveryBoundary} from './RecoveryBoundary'
import './styles.css'
import './instruments.css'
import {installSnapshotTransport} from './snapshotTransport'
installSnapshotTransport()
createRoot(document.getElementById('root')!).render(<React.StrictMode><RecoveryBoundary><App /></RecoveryBoundary></React.StrictMode>)
