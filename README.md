# LUMA — Holographic Studio MVP

A Next.js browser studio for experimenting with live portrait segmentation on a pure-black canvas and a cyan hologram-inspired look.

## Run locally

1. Install Node.js 20 or newer.
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`
4. Open `http://localhost:3000` and allow camera access.

Camera access requires HTTPS in production or localhost during development. The MediaPipe Selfie Segmentation script and model files load from jsDelivr, so the first run needs an internet connection.

## Included

- Live camera preview with person segmentation.
- Black canvas background, cyan glow, optional scan lines.
- Horizontal mirror and vertical flip.
- Brightness and glow controls.
- Front/rear camera selection and fullscreen.

## Important limitations

This is a visual MVP, not a real hologram projector. Pepper's Ghost requires a suitable transparent reflective surface and a controlled viewing environment. Black pixels reduce unwanted light but cannot guarantee perfect invisibility on every display.

The current build segments the device camera. To show the other person during a video call, the app must receive that participant's remote video stream through a video-call integration; it cannot automatically take over another app's call stream.

## Deploy

Import this repository into Vercel or another Next.js host. No secret environment variables are required for this prototype.