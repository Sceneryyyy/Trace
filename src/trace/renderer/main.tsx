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
import {applyTheme} from './themeRuntime'
import {defaultThemeId,isThemeId} from '../instrumentThemes'
// Main process passes the saved theme in the URL; validate again so a tampered query cannot inject values.
const startupTheme=new URLSearchParams(location.search).get('theme')
applyTheme(isThemeId(startupTheme)?startupTheme:defaultThemeId)
installSnapshotTransport()
createRoot(document.getElementById('root')!).render(<React.StrictMode><RecoveryBoundary><App /></RecoveryBoundary></React.StrictMode>)
