# Rebound Board Web v0.1

A static HTTPS-ready PWA for testing whether an old Android phone mounted behind a rebound board can reliably detect soccer-ball strikes using DeviceMotionEvent.

## Files
- index.html — UI
- app.js — sensor, hit detection, calibration, saved settings
- styles.css — layout
- manifest.webmanifest — installable PWA metadata
- sw.js — offline cache after first successful HTTPS load
- icon-192.png / icon-512.png — PWA icons

## Deploy for free

### Easiest: Netlify Drop
1. Unzip this folder on a computer.
2. Go to https://app.netlify.com/drop
3. Drag the whole ReboundBoardWeb_v0.1 folder onto the page.
4. Netlify gives you a free HTTPS URL.
5. Open that URL on the Android phone.

### GitHub Pages
1. Create a new GitHub repository.
2. Upload the files from this folder to the repository root.
3. In repository Settings → Pages, publish from the main branch/root.
4. Open the resulting HTTPS URL on the Android.

## Android use
1. Open the HTTPS URL in Chrome.
2. Tap Enable sensor.
3. Verify Samples/sec rises above 0.
4. Mount the phone firmly behind the rebound board.
5. Make several normal passes and compare Peak values.
6. Use Calibrate from 5 passes for a starting threshold.
7. Open Full-screen target and confirm one strike = one HIT.
8. Add the page to the Android home screen if desired.

Settings (board ID, threshold, debounce) are saved locally on each phone.

## Important
A downloaded local HTML file may not receive motion data. Use the deployed HTTPS URL for the real test.

This v0.1 intentionally has no multi-phone networking yet. Once impact detection is proven, the same PWA can be extended so Android boards connect to an iPhone coach controller.
