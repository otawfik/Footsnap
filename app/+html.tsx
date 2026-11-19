/**
 * The HTML around every pre-rendered web page (Expo Router static output). On top of Expo's
 * default head it makes the web build installable: the web app manifest, the home-screen icon and
 * status bar settings iOS reads from meta tags, and the service worker (public/sw.js) that keeps
 * the app shell for offline launches. Only the production export registers the worker, so
 * `expo start` never serves a cached bundle.
 */
import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

const GROUND = '#102040'; // color.bg in constants/design.ts

const REGISTER = `if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="description" content="A collectible card game for real football: live fixtures, a goals model's forecast for every match, and cards from this season's real numbers." />
        <meta name="theme-color" content={GROUND} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="FootSnap" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `body{background-color:${GROUND}}` }} />
        {process.env.NODE_ENV === 'production' ? <script dangerouslySetInnerHTML={{ __html: REGISTER }} /> : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
