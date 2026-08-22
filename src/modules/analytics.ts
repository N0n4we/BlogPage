const GA_MEASUREMENT_ID = 'G-B9MKPX717B';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/** Send a page view for a client-side route without reloading the document. */
export function trackPageView(pagePath: string): void {
  if (typeof window.gtag !== 'function') return;

  window.gtag('event', 'page_view', {
    send_to: GA_MEASUREMENT_ID,
    page_path: pagePath,
    page_location: window.location.href,
  });
}

export {};
